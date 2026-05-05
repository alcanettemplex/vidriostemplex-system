import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart2, Users, Wrench, DollarSign, ShieldAlert, Lightbulb,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  XCircle, Clock, Search, RefreshCw, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${sessionStorage.getItem('token')}`,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

function hoy() {
  return new Date().toISOString().split('T')[0];
}
function hace7dias() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
}
function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function inicioMesPasado() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function finMesPasado() {
  const d = new Date();
  d.setDate(0);
  return d.toISOString().split('T')[0];
}

// ─── Componentes base ─────────────────────────────────────────────────────────

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <Info className="w-3 h-3 text-slate-400 cursor-help hover:text-indigo-500 transition-colors" />
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-slate-800 text-white text-[11px] rounded-xl px-3 py-2.5 z-50 leading-relaxed shadow-xl pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  );
};

const Semaforo: React.FC<{ estado: string; label: string; desc?: string }> = ({ estado, label, desc }) => {
  const cfg: Record<string, { bg: string; icon: React.ReactNode }> = {
    verde:    { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
    amarillo: { bg: 'bg-amber-50 border-amber-200 text-amber-700',       icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
    rojo:     { bg: 'bg-red-50 border-red-200 text-red-700',             icon: <XCircle className="w-4 h-4 text-red-500" /> },
  };
  const c = cfg[estado] || cfg['amarillo'];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold ${c.bg}`}>
      {c.icon} {label}
      {desc && <InfoTooltip text={desc} />}
    </div>
  );
};

const KPICard: React.FC<{
  label: string; value: string | number; sub?: string;
  delta?: number | null; color?: string; desc?: string;
}> = ({ label, value, sub, delta, color = 'blue', desc }) => {
  const colores: Record<string, string> = {
    blue:   'from-blue-50 to-blue-100 border-blue-200',
    green:  'from-emerald-50 to-emerald-100 border-emerald-200',
    amber:  'from-amber-50 to-amber-100 border-amber-200',
    red:    'from-red-50 to-red-100 border-red-200',
    purple: 'from-purple-50 to-purple-100 border-purple-200',
    slate:  'from-slate-50 to-slate-100 border-slate-200',
  };
  return (
    <div className={`bg-gradient-to-br ${colores[color] || colores.blue} border rounded-xl p-4`}>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        {desc && <InfoTooltip text={desc} />}
      </div>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {delta !== undefined && delta !== null && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
          {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {delta > 0 ? '+' : ''}{delta}% vs período anterior
        </div>
      )}
    </div>
  );
};

const NivelBadge: React.FC<{ nivel: string }> = ({ nivel }) => {
  const cfg: Record<string, string> = {
    critico:  'bg-red-100 text-red-700 border-red-300',
    moderado: 'bg-amber-100 text-amber-700 border-amber-300',
    atencion: 'bg-blue-100 text-blue-700 border-blue-300',
  };
  const labels: Record<string, string> = { critico: '🔴 CRÍTICO', moderado: '🟡 MODERADO', atencion: '🔵 ATENCIÓN' };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-extrabold border rounded-full ${cfg[nivel] || cfg.atencion}`}>
      {labels[nivel] || nivel.toUpperCase()}
    </span>
  );
};

const AreaBadge: React.FC<{ area: string }> = ({ area }) => {
  const cfg: Record<string, string> = {
    produccion: 'bg-orange-100 text-orange-700',
    comercial:  'bg-purple-100 text-purple-700',
    finanzas:   'bg-green-100 text-green-700',
    calidad:    'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = { produccion: 'Producción', comercial: 'Comercial', finanzas: 'Finanzas', calidad: 'Calidad' };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${cfg[area] || 'bg-slate-100 text-slate-600'}`}>
      {labels[area] || area}
    </span>
  );
};

const CheckboxPill: React.FC<{ label: string; ok: boolean }> = ({ label, ok }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
    ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
  }`}>
    {ok ? '✓' : '✗'} {label}
  </span>
);

// ─── Selector de Fechas + Asesor + Buscador ───────────────────────────────────

interface FiltrosProps {
  desde: string; hasta: string;
  onDesde: (v: string) => void; onHasta: (v: string) => void;
  asesores?: { id: number; nombre: string }[];
  asesorId?: string; onAsesorId?: (v: string) => void;
  busqueda?: string; onBusqueda?: (v: string) => void;
  onRefresh: () => void; loading: boolean;
}

const Filtros: React.FC<FiltrosProps> = ({
  desde, hasta, onDesde, onHasta,
  asesores, asesorId, onAsesorId,
  busqueda, onBusqueda,
  onRefresh, loading,
}) => (
  <div className="flex flex-wrap items-end gap-3 mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200">
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Desde</label>
      <input type="date" value={desde} onChange={e => onDesde(e.target.value)}
        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hasta</label>
      <input type="date" value={hasta} onChange={e => onHasta(e.target.value)}
        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
    <div className="flex gap-1">
      {[
        { label: 'Esta sem.', fn: () => { onDesde(hace7dias()); onHasta(hoy()); } },
        { label: 'Este mes', fn: () => { onDesde(inicioMes()); onHasta(hoy()); } },
        { label: 'Mes ant.', fn: () => { onDesde(inicioMesPasado()); onHasta(finMesPasado()); } },
      ].map(b => (
        <button key={b.label} onClick={b.fn}
          className="px-2 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition">
          {b.label}
        </button>
      ))}
    </div>
    {asesores && onAsesorId && (
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Asesor</label>
        <select value={asesorId || ''} onChange={e => onAsesorId(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Todos</option>
          {asesores.map(a => <option key={a.id} value={String(a.id)}>{a.nombre}</option>)}
        </select>
      </div>
    )}
    {onBusqueda !== undefined && (
      <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 bg-white">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input type="text" value={busqueda || ''} onChange={e => onBusqueda(e.target.value)}
          placeholder="Buscar ODP..." className="py-1.5 text-sm focus:outline-none w-32" />
      </div>
    )}
    <button onClick={onRefresh} disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 disabled:opacity-50 transition">
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
    </button>
  </div>
);

// ─── Tabla base ───────────────────────────────────────────────────────────────

const TablaVacia: React.FC<{ msg?: string }> = ({ msg = 'Sin datos para mostrar' }) => (
  <div className="text-center py-8 text-slate-400 text-sm">{msg}</div>
);

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS_CONFIG = [
  { id: 'resumen',     label: 'Resumen Ejecutivo',    icon: BarChart2 },
  { id: 'asesores',   label: 'Asesores y Metas',     icon: Users },
  { id: 'produccion', label: 'Producción Crítica',    icon: Wrench },
  { id: 'financiero', label: 'Financiero y Cartera',  icon: DollarSign },
  { id: 'calidad',    label: 'Calidad y NC',           icon: ShieldAlert },
  { id: 'recomendaciones', label: 'Recomendaciones',  icon: Lightbulb },
];

// ─── Tab 1: Resumen ───────────────────────────────────────────────────────────

const TabResumen: React.FC<{ asesores: { id: number; nombre: string }[] }> = ({ asesores }) => {
  const [desde, setDesde] = useState(hace7dias());
  const [hasta, setHasta] = useState(hoy());
  const [asesorId, setAsesorId] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta, ...(asesorId ? { asesor_id: asesorId } : {}) });
      const r = await fetch(`${API}/api/informe-ejecutivo/resumen?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta, asesorId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const d = data as any;

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        asesores={asesores} asesorId={asesorId} onAsesorId={setAsesorId}
        onRefresh={fetch_} loading={loading} />

      {d && (
        <>
          {/* Semáforo */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Salud del Sistema</p>
              <InfoTooltip text="Indicadores de semáforo calculados automáticamente. Verde = óptimo, Amarillo = atención, Rojo = acción urgente requerida." />
            </div>
            <div className="flex flex-wrap gap-2">
              <Semaforo estado={d.semaforo?.comercial}  label="Comercial"
                desc="Basado en la tasa de conversión de prospectos a ODP. Verde ≥40%, Amarillo ≥20%, Rojo <20%." />
              <Semaforo estado={d.semaforo?.produccion} label="Producción"
                desc="Basado en ODPs con fecha de entrega vencida que no han sido entregadas. Verde = 0 atrasadas, Amarillo ≤3, Rojo >3." />
              <Semaforo estado={d.semaforo?.finanzas}   label="Finanzas"
                desc="Ratio entre el total pendiente por recoger y el valor facturado. Verde <30%, Amarillo <60%, Rojo ≥60%." />
              <Semaforo estado={d.semaforo?.calidad}    label="Calidad"
                desc="Basado en No Conformidades en estado ABIERTO o EN_PROCESO. Verde = 0 NC abiertas, Amarillo ≤3, Rojo >3." />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KPICard label="ODPs Creadas"    value={d.odps_creadas}    delta={d.delta_odps_creadas} color="blue"
              desc="Total de Órdenes de Producción creadas en el período seleccionado. Incluye OAs. La flecha compara con el período equivalente anterior." />
            <KPICard label="ODPs Entregadas" value={d.odps_entregadas} color="green"
              desc="ODPs que transitaron al estado ENTREGADA dentro del período, según el historial de cambios de estado." />
            <KPICard label="ODPs Facturadas" value={d.odps_facturadas} color="green"
              desc="ODPs cuya fecha de factura cae dentro del período y tienen estado de facturación FACTURADA." />
            <KPICard label="ODPs Atrasadas"  value={d.odps_atrasadas}  color={d.odps_atrasadas > 0 ? 'red' : 'green'}
              desc="ODPs cuya fecha de entrega comprometida ya venció y no han sido entregadas ni instaladas. No incluye pausadas ni canceladas." />
            <KPICard label="Valor Facturado"  value={COP(d.valor_facturado || 0)} color="green"
              desc="Suma del valor total (valor_total) de las ODPs facturadas cuya fecha de factura cae en el período." />
            <KPICard label="Cobros Recibidos" value={COP(d.cobros_recibidos || 0)} color="blue"
              desc="Suma de todos los pagos y abonos registrados en el módulo de Contabilidad durante el período seleccionado." />
            <KPICard label="Por Recoger"      value={COP(d.total_pendiente || 0)} color="amber"
              desc="Suma del campo 'pendiente' de todas las ODPs activas no canceladas, sin importar el período. Representa el dinero comprometido que aún no ha ingresado." />
            <KPICard label="Tasa Conversión"  value={`${d.tasa_conversion || 0}%`}
              sub={`${d.prospectos_convertidos}/${d.prospectos_nuevos} prospectos`} color="purple"
              desc="Porcentaje de prospectos creados en el período que fueron convertidos en ODP. Un prospecto se convierte cuando se le asigna una ODP." />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KPICard label="Prospectos Nuevos"    value={d.prospectos_nuevos} color="slate"
              desc="Cantidad de prospectos (leads comerciales) registrados en el sistema durante el período seleccionado." />
            <KPICard label="NC Abiertas"          value={d.nc_abiertas}       color={d.nc_abiertas > 0 ? 'red' : 'green'}
              desc="No Conformidades actualmente en estado ABIERTO o EN_PROCESO en todo el sistema, sin filtro de fecha. Requieren seguimiento activo." />
            <KPICard label="ODPs Pausadas"        value={d.odps_pausadas}     color={d.odps_pausadas > 0 ? 'amber' : 'green'}
              desc="ODPs actualmente en estado PAUSADA — detenidas por algún motivo externo (cliente, material, pago). Se muestra el total sin filtro de período." />
            <KPICard label="Listas sin Programar" value={d.odps_listas_sin_programar} color={d.odps_listas_sin_programar > 0 ? 'amber' : 'green'}
              desc="ODPs en estado LISTO_INSTALAR que no han sido asignadas a ninguna ruta de instalación activa. Están listas para instalar pero sin fecha programada." />
          </div>

          {/* Gráfico de barras por día */}
          {d.odps_por_dia?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">ODPs Creadas por Día</p>
                <InfoTooltip text="Distribución diaria de ODPs creadas en el período. Permite identificar días de alta y baja actividad comercial." />
              </div>
              <div className="flex items-end gap-1 h-24 bg-slate-50 rounded-xl p-3 border border-slate-200">
                {d.odps_por_dia.map((row: { dia: string; total: number }) => {
                  const max = Math.max(...d.odps_por_dia.map((r: { total: number }) => r.total), 1);
                  const pct = Math.round((row.total / max) * 100);
                  return (
                    <div key={row.dia} className="flex-1 flex flex-col items-center gap-1" title={`${row.dia}: ${row.total}`}>
                      <span className="text-[9px] text-slate-500">{row.total}</span>
                      <div className="w-full bg-blue-400 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }} />
                      <span className="text-[9px] text-slate-400 truncate max-w-full">{row.dia.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Tab 2: Asesores y Metas ──────────────────────────────────────────────────

const TabAsesores: React.FC<{ asesores: { id: number; nombre: string }[] }> = ({ asesores }) => {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [asesorId, setAsesorId] = useState('');
  const [data, setData] = useState<{ asesores: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState('todos');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta, ...(asesorId ? { asesor_id: asesorId } : {}) });
      const r = await fetch(`${API}/api/informe-ejecutivo/asesores?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta, asesorId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const lista = (data?.asesores || []) as any[];
  const asesorDetalle = subTab !== 'todos' ? lista.find(a => String(a.asesor_id) === subTab) : null;

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        asesores={asesores} asesorId={asesorId} onAsesorId={v => { setAsesorId(v); setSubTab('todos'); }}
        onRefresh={fetch_} loading={loading} />

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button onClick={() => setSubTab('todos')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${subTab === 'todos' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          Todos
        </button>
        {lista.map(a => (
          <button key={a.asesor_id} onClick={() => setSubTab(String(a.asesor_id))}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${subTab === String(a.asesor_id) ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {a.nombre.split(' ')[0]}
          </button>
        ))}
      </div>

      {subTab === 'todos' ? (
        <div className="overflow-x-auto">
          <p className="text-xs text-slate-500 mb-3">
            Ranking comparativo de todos los asesores. Haz clic en una fila para ver el detalle individual.
            Los valores de <strong>Facturado</strong> y <strong>Meta</strong> corresponden al período seleccionado;
            <strong> Por Recoger</strong> es la cartera activa total sin importar el período.
          </p>
          {lista.length === 0 ? <TablaVacia /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="text-left px-3 py-2 rounded-tl-lg">#</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Meta <InfoTooltip text="Meta individual del asesor para el período (suma de meses). Configurada en Configuración → Metas." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Facturado <InfoTooltip text="Suma del valor_total (abono + pendiente) de ODPs del asesor en el período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">% Meta <InfoTooltip text="Qué porcentaje de la meta individual ha alcanzado el asesor en el período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Recaudado <InfoTooltip text="Suma de abonos efectivamente cobrados de las ODPs del asesor en el período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Por Recoger <InfoTooltip text="Cartera pendiente total del asesor en ODPs activas. No está filtrada por período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">ODPs <InfoTooltip text="Número de ODPs creadas por el asesor en el período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Prosp. <InfoTooltip text="Prospectos (leads) registrados por el asesor en el período." /></span>
                  </th>
                  <th className="text-right px-3 py-2 rounded-tr-lg whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">Convers. <InfoTooltip text="Tasa de conversión de prospectos a ODP del asesor en el período." /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a, i) => {
                  const pct = a.pct_meta;
                  const pctColor = pct === null ? 'text-slate-400' : pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <tr key={a.asesor_id} className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${subTab === String(a.asesor_id) ? 'bg-blue-50' : ''}`}
                      onClick={() => setSubTab(String(a.asesor_id))}>
                      <td className="px-3 py-2 text-slate-400 text-xs">#{i + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{a.nombre}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{a.meta > 0 ? COP(a.meta) : '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800">{COP(a.real)}</td>
                      <td className={`px-3 py-2 text-right font-extrabold ${pctColor}`}>
                        {pct !== null ? `${pct}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-700">{COP(a.recaudado)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{COP(a.pendiente)}</td>
                      <td className="px-3 py-2 text-right">{a.odps_periodo}</td>
                      <td className="px-3 py-2 text-right">{a.prospectos_nuevos}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.tasa_conversion}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : asesorDetalle ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-full">
            <h3 className="font-black text-lg text-slate-800">{asesorDetalle.nombre}</h3>
            <p className="text-xs text-slate-400 uppercase">{asesorDetalle.rol}</p>
          </div>
          <KPICard label="Meta del período"  value={asesorDetalle.meta > 0 ? COP(asesorDetalle.meta) : '—'} color="blue"
            desc="Meta de facturación individual configurada para este asesor en el período (suma de meses seleccionados). Se configura en Configuración → Metas." />
          <KPICard label="Facturado" value={COP(asesorDetalle.real)} color="green"
            sub={asesorDetalle.pct_meta !== null ? `${asesorDetalle.pct_meta}% de la meta` : undefined}
            desc="Suma del valor total (abono + pendiente) de todas las ODPs creadas por este asesor en el período. Representa el monto total contratado, no necesariamente cobrado." />
          <KPICard label="Recaudado" value={COP(asesorDetalle.recaudado)} color="green"
            desc="Suma del campo 'abono' de las ODPs del asesor — dinero efectivamente cobrado y registrado hasta la fecha." />
          <KPICard label="Por Recoger" value={COP(asesorDetalle.pendiente)} color="amber"
            desc="Suma del campo 'pendiente' de ODPs activas no canceladas de este asesor. Dinero comprometido que aún no ha sido cobrado." />
          <KPICard label="ODPs en el período" value={asesorDetalle.odps_periodo} color="slate"
            desc="Número total de ODPs creadas y asignadas a este asesor dentro del período seleccionado." />
          <KPICard label="Prospectos Nuevos"  value={asesorDetalle.prospectos_nuevos} color="slate"
            desc="Cantidad de prospectos registrados por este asesor en el período. Un prospecto es un lead comercial previo a convertirse en ODP." />
          <KPICard label="Convertidos a ODP"  value={asesorDetalle.prospectos_convertidos} color="purple"
            desc="Prospectos de este asesor en el período que fueron aprobados y generaron una ODP." />
          <KPICard label="Tasa Conversión"    value={`${asesorDetalle.tasa_conversion}%`} color="purple"
            desc="Porcentaje de prospectos del asesor que se convirtieron en ODP. Indica la efectividad comercial en el cierre de negocios." />
          {/* Barra de meta */}
          {asesorDetalle.meta > 0 && (
            <div className="col-span-full">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Avance de Meta</p>
                <InfoTooltip text="Porcentaje del valor facturado sobre la meta individual del asesor en el período. Verde ≥100%, Amarillo ≥70%, Rojo <70%." />
              </div>
              <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${asesorDetalle.pct_meta >= 100 ? 'bg-emerald-500' : asesorDetalle.pct_meta >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(asesorDetalle.pct_meta || 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{asesorDetalle.pct_meta || 0}% completado</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

// ─── Tab 3: Producción Crítica ────────────────────────────────────────────────

const LABELS_ESTADO: Record<string, string> = {
  EN_ESPERA: 'En Espera', VISITA_TECNICA: 'Visita Técnica', MEDICION: 'Medición',
  PEDIDO_PROVEEDOR: 'Pedido Proveedor', ALUMINIO_CORTADO: 'Aluminio Cortado',
  VIDRIO_RECIBIDO: 'Vidrio Recibido', ACCESORIOS_SEPARADOS: 'Accesorios Sep.',
  LISTO_INSTALAR: 'Listo Instalar', PROGRAMADA: 'Programada',
  INSTALADA: 'Instalada', PAUSADA: 'Pausada',
};

const LABELS_CHK: Record<string, string> = {
  chk_medicion: 'Medición', chk_corte: 'Corte', chk_vidrio: 'Vidrio',
  chk_accesorios: 'Accesorios', chk_ensamble: 'Ensamble', chk_matizado: 'Matizado',
  chk_pelicula: 'Película', chk_huacal: 'Huacal', chk_carton: 'Cartón',
};

const TabProduccion: React.FC<{ asesores: { id: number; nombre: string }[] }> = ({ asesores }) => {
  const [desde, setDesde] = useState(hace7dias());
  const [hasta, setHasta] = useState(hoy());
  const [asesorId, setAsesorId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [seccion, setSeccion] = useState<'material' | 'listas' | 'atrasadas' | 'pausadas' | 'embudo'>('material');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta, ...(asesorId ? { asesor_id: asesorId } : {}), ...(busqueda ? { busqueda } : {}) });
      const r = await fetch(`${API}/api/informe-ejecutivo/produccion-critica?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta, asesorId, busqueda]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const d = data as any;

  const secciones = [
    { id: 'material',  label: `Material listo sin instalar (${d?.material_en_produccion?.length || 0})` },
    { id: 'listas',    label: `Listas sin programar (${d?.listas_sin_programar?.length || 0})` },
    { id: 'atrasadas', label: `Atrasadas (${d?.atrasadas?.length || 0})` },
    { id: 'pausadas',  label: `Pausadas (${d?.pausadas?.length || 0})` },
    { id: 'embudo',    label: 'Embudo de producción' },
  ];

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        asesores={asesores} asesorId={asesorId} onAsesorId={setAsesorId}
        busqueda={busqueda} onBusqueda={setBusqueda}
        onRefresh={fetch_} loading={loading} />

      {/* Selector de sección */}
      <div className="flex flex-wrap gap-1 mb-4">
        {secciones.map(s => (
          <button key={s.id} onClick={() => setSeccion(s.id as typeof seccion)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${seccion === s.id ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {d && seccion === 'material' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-xs text-orange-800">
              <strong>¿Qué muestra esta sección?</strong> ODPs donde se definió una fecha de listo de material
              (<em>fecha_listo_instalar</em>) que ya pasó, pero el estado de producción <strong>aún no avanzó</strong> a
              LISTO_INSTALAR o superior. Indica que hay material listo esperando que producción actualice el estado.
              Los íconos ✓/✗ muestran qué etapas de la checklist de producción están completadas para cada ODP.
            </p>
          </div>
          {d.material_en_produccion?.length === 0 ? <TablaVacia msg="Sin ODPs en esta condición ✓" /> : (
            <div className="space-y-3">
              {d.material_en_produccion.map((o: any) => (
                <div key={o.id} className="bg-white border border-red-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="font-black text-slate-800">{o.numero_odp}</span>
                      <span className="ml-2 text-sm text-slate-600">{o.cliente}</span>
                      <span className="ml-2 text-xs text-slate-400">/ {o.asesor}</span>
                    </div>
                    <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {o.dias_retraso}d retraso
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span>Estado: <strong className="text-slate-700">{LABELS_ESTADO[o.estado_produccion] || o.estado_produccion}</strong></span>
                    <span>•</span>
                    <span>Pendiente: <strong className="text-amber-700">{COP(o.pendiente)}</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(LABELS_CHK).map(([k, label]) => (
                      <CheckboxPill key={k} label={label} ok={!!o.checkboxes?.[k]} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {d && seccion === 'listas' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              <strong>¿Qué muestra esta sección?</strong> ODPs en estado <strong>LISTO_INSTALAR</strong>
              que no están asignadas a ninguna ruta de instalación activa. Esto significa que el trabajo
              en planta está terminado pero <strong>aún no se coordinó la instalación con el cliente</strong>.
              <em> Días lista</em> = cuántos días lleva en ese estado sin programar.
            </p>
          </div>
          {d.listas_sin_programar?.length === 0 ? <TablaVacia msg="Todas las ODPs listas están programadas ✓" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                  <th className="text-left px-3 py-2">ODP</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-right px-3 py-2">Días lista</th>
                  <th className="text-right px-3 py-2">F. Entrega</th>
                  <th className="text-right px-3 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {d.listas_sin_programar.map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{o.numero_odp}</td>
                    <td className="px-3 py-2 text-slate-700">{o.cliente}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{o.asesor}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-600">{o.dias_lista ?? '—'}d</td>
                    <td className="px-3 py-2 text-right text-slate-500">{o.fecha_entrega ? o.fecha_entrega.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-bold">{COP(o.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {d && seccion === 'atrasadas' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-800">
              <strong>¿Qué muestra esta sección?</strong> ODPs cuya <strong>fecha de entrega comprometida al cliente
              ya venció</strong> y aún no han sido entregadas ni instaladas. No incluye pausadas ni canceladas.
              <em> Días atraso</em> = cuántos días pasaron desde la fecha de entrega prometida.
              Son las ODPs que generan mayor riesgo de insatisfacción del cliente.
            </p>
          </div>
          {d.atrasadas?.length === 0 ? <TablaVacia msg="Sin ODPs atrasadas ✓" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                  <th className="text-left px-3 py-2">ODP</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2">Días atraso</th>
                  <th className="text-right px-3 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {d.atrasadas.map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{o.numero_odp}</td>
                    <td className="px-3 py-2 text-slate-700">{o.cliente}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{o.asesor}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{LABELS_ESTADO[o.estado_produccion] || o.estado_produccion}</td>
                    <td className="px-3 py-2 text-right font-extrabold text-red-600">{o.dias_retraso}d</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-bold">{COP(o.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {d && seccion === 'pausadas' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600">
              <strong>¿Qué muestra esta sección?</strong> ODPs en estado <strong>PAUSADA</strong> — detenidas
              por algún motivo externo como espera de material del cliente, ajuste de diseño, problema de pago,
              o decisión del cliente. La fecha de creación indica cuánto tiempo lleva la ODP en el sistema.
              Revisar si alguna puede reactivarse.
            </p>
          </div>
          {d.pausadas?.length === 0 ? <TablaVacia msg="Sin ODPs pausadas ✓" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                  <th className="text-left px-3 py-2">ODP</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-right px-3 py-2">F. Creación</th>
                  <th className="text-right px-3 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {d.pausadas.map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{o.numero_odp}</td>
                    <td className="px-3 py-2 text-slate-700">{o.cliente}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{o.asesor}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{o.fecha_creacion ? o.fecha_creacion.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-bold">{COP(o.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {d && seccion === 'embudo' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <BarChart2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800">
              <strong>¿Qué muestra este embudo?</strong> La distribución <em>en tiempo real</em> de todas las
              ODPs activas no entregadas por estado de producción. Permite identificar en qué etapa se acumula
              el mayor volumen de trabajo y detectar cuellos de botella. Los estados aparecen en orden de flujo:
              desde EN_ESPERA hasta INSTALADA.
            </p>
          </div>
          <div className="space-y-2">
            {d.embudo?.filter((e: any) => e.total > 0).map((e: any) => {
              const max = Math.max(...(d.embudo?.map((x: any) => x.total) || [1]));
              const pct = max > 0 ? Math.round((e.total / max) * 100) : 0;
              const barColor = e.estado === 'PAUSADA' ? 'bg-amber-400'
                : e.estado === 'LISTO_INSTALAR' ? 'bg-emerald-400'
                : e.estado === 'PROGRAMADA' ? 'bg-blue-400' : 'bg-slate-400';
              return (
                <div key={e.estado} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600 w-40 shrink-0">{LABELS_ESTADO[e.estado] || e.estado}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-6 text-right">{e.total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tab 4: Financiero ────────────────────────────────────────────────────────

const TabFinanciero: React.FC<{ asesores: { id: number; nombre: string }[] }> = ({ asesores }) => {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [asesorId, setAsesorId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [seccion, setSeccion] = useState<'resumen' | 'matpago' | 'cartera' | 'credito'>('resumen');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta, ...(asesorId ? { asesor_id: asesorId } : {}), ...(busqueda ? { busqueda } : {}) });
      const r = await fetch(`${API}/api/informe-ejecutivo/financiero?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta, asesorId, busqueda]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const d = data as any;

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        asesores={asesores} asesorId={asesorId} onAsesorId={setAsesorId}
        busqueda={busqueda} onBusqueda={setBusqueda}
        onRefresh={fetch_} loading={loading} />

      <div className="flex flex-wrap gap-1 mb-4">
        {[
          { id: 'resumen', label: 'Resumen' },
          { id: 'matpago', label: `Material listo sin pagar (${d?.mat_listo_sin_pagar?.length || 0})` },
          { id: 'cartera', label: 'Cartera por cliente' },
          { id: 'credito', label: `Crédito aprobado (${d?.credito_aprobado?.length || 0})` },
        ].map(s => (
          <button key={s.id} onClick={() => setSeccion(s.id as typeof seccion)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${seccion === s.id ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {d && seccion === 'resumen' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KPICard label="Valor Facturado"      value={COP(d.valor_facturado || 0)}        color="green"
              desc="Suma del valor_total de ODPs cuya fecha de factura cae dentro del período. Representa el dinero que la empresa facturó formalmente al cliente." />
            <KPICard label="Cobros Recibidos"     value={COP(d.cobros_recibidos || 0)}       color="blue"
              desc="Suma de todos los pagos y abonos registrados en Contabilidad durante el período. Dinero que efectivamente ingresó a caja." />
            <KPICard label="Por Recoger (activo)" value={COP(d.total_pendiente_activo || 0)} color="amber"
              desc="Suma del campo 'pendiente' de TODAS las ODPs activas no canceladas. No está filtrada por período — muestra la cartera total vigente por cobrar." />
            <KPICard label="Proyección Ingresos"  value={COP(d.proyeccion_valor || 0)}
              sub="ODPs listas + programadas" color="purple"
              desc="Valor total de ODPs en estado LISTO_INSTALAR o PROGRAMADA. Son trabajos terminados o casi terminados cuyo cobro debería ocurrir próximamente." />
          </div>
          {d.meta_empresa > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Meta Empresa del Período</p>
                <InfoTooltip text="Suma de las metas individuales de todos los asesores para los meses del período. La barra muestra qué porcentaje del objetivo total se ha facturado." />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(Math.round(((d.valor_facturado || 0) / d.meta_empresa) * 100), 100)}%` }} />
                </div>
                <span className="text-sm font-bold text-slate-700">
                  {Math.round(((d.valor_facturado || 0) / d.meta_empresa) * 100)}%
                </span>
                <span className="text-xs text-slate-400">de {COP(d.meta_empresa)}</span>
              </div>
            </div>
          )}
          {d.distribucion_forma_pago?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Distribución por Forma de Pago</p>
                <InfoTooltip text="Cantidad de ODPs y valor total agrupados por forma de pago (contado, crédito, cheque, etc.) en el período seleccionado. Útil para analizar el riesgo de cartera." />
              </div>
              <div className="flex flex-wrap gap-2">
                {d.distribucion_forma_pago.map((r: any) => (
                  <div key={r.forma_pago} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-700 capitalize">{r.forma_pago || 'Sin definir'}</p>
                    <p className="text-xs text-slate-500">{r.total} ODP{Number(r.total) !== 1 ? 's' : ''} · {COP(Number(r.valor || 0))}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {d && seccion === 'matpago' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <DollarSign className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              <strong>¿Qué muestra esta sección?</strong> ODPs donde se definió una fecha de listo de material
              (<em>fecha_listo_instalar</em>) pero el cliente <strong>aún no ha pagado el saldo total</strong>.
              Son casos donde el trabajo está hecho o casi hecho pero el cobro está pendiente.
              El campo <em>Pendiente</em> muestra exactamente cuánto falta por cobrar a cada cliente.
            </p>
          </div>
          {d.mat_listo_sin_pagar?.length === 0 ? <TablaVacia msg="Sin ODPs en esta condición ✓" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                  <th className="text-left px-3 py-2">ODP</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-left px-3 py-2">Forma Pago</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Abonado</th>
                  <th className="text-right px-3 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {d.mat_listo_sin_pagar.map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{o.numero_odp}</td>
                    <td className="px-3 py-2 text-slate-700">{o.cliente}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{o.asesor}</td>
                    <td className="px-3 py-2 text-xs capitalize">{o.forma_pago || '—'}</td>
                    <td className="px-3 py-2 text-right">{COP(o.valor_total)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{COP(o.abono)}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-600">{COP(o.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {d && seccion === 'cartera' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Users className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-700">
              <strong>¿Qué muestra esta sección?</strong> Los 15 clientes con mayor saldo pendiente acumulado
              en ODPs activas (no entregadas, no canceladas), <strong>sin filtro de período</strong>. La barra
              muestra el tamaño relativo de la cartera de cada cliente respecto al mayor deudor.
              Priorizar la gestión de cobro comenzando por los de mayor monto.
            </p>
          </div>
          {d.cartera_por_cliente?.length === 0 ? <TablaVacia msg="Sin cartera pendiente ✓" /> : (
            <div className="space-y-2">
              {d.cartera_por_cliente.map((c: any, i: number) => {
                const max = Number(d.cartera_por_cliente[0]?.total || 1);
                const pct = Math.round((Number(c.total) / max) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-5">#{i + 1}</span>
                    <span className="text-sm font-semibold text-slate-700 w-48 truncate">{c.cliente}</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-bold text-amber-700 text-right w-32">{COP(Number(c.total))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {d && seccion === 'credito' && (
        <div>
          <div className="flex items-start gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-800">
              <strong>¿Qué muestra esta sección?</strong> ODPs con estado de caja <strong>CRÉDITO_APROBADO</strong>
              que aún tienen saldo pendiente. Esto significa que se autorizó entregar el trabajo a crédito —
              el cliente tiene plazo para pagar pero la instalación ya puede proceder. Son ODPs de riesgo
              financiero controlado que requieren seguimiento de cobro.
            </p>
          </div>
          {d.credito_aprobado?.length === 0 ? <TablaVacia msg="Sin ODPs con crédito aprobado ✓" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                  <th className="text-left px-3 py-2">ODP</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Asesor</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {d.credito_aprobado.map((o: any) => (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-800">{o.numero_odp}</td>
                    <td className="px-3 py-2 text-slate-700">{o.cliente}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{o.asesor}</td>
                    <td className="px-3 py-2 text-xs">{LABELS_ESTADO[o.estado_produccion] || o.estado_produccion}</td>
                    <td className="px-3 py-2 text-right">{COP(o.valor_total)}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">{COP(o.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Tab 5: Calidad ───────────────────────────────────────────────────────────

const TabCalidad: React.FC = () => {
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const LABELS_TIPO: Record<string, string> = {
    ERROR_INTERNO: 'Error Interno', DANO_PLANTA: 'Daño en Planta',
    REPROCESO: 'Reproceso', QUEJA: 'Queja',
  };

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta, ...(busqueda ? { busqueda } : {}) });
      const r = await fetch(`${API}/api/informe-ejecutivo/calidad?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta, busqueda]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const d = data as any;

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        busqueda={busqueda} onBusqueda={setBusqueda}
        onRefresh={fetch_} loading={loading} />

      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KPICard label="Total NC"           value={d.total_nc}     color="slate"
              desc="Total de No Conformidades registradas en el período. Una NC se genera cuando se detecta un defecto, error de proceso, daño o queja." />
            <KPICard label="Cerradas"           value={d.cerradas_nc}  color="green" sub={`${d.tasa_cierre}% tasa cierre`}
              desc="NC en estado CERRADO en el período. La tasa de cierre (%) indica qué tan eficiente es el equipo resolviendo los problemas que se reportan." />
            <KPICard label="Costo Total NC"     value={COP(d.costo_total || 0)} color="red"
              desc="Suma del campo 'costo_total' de todas las NC del período. Representa el impacto económico directo de los defectos: materiales repuestos, tiempo extra, etc." />
            <KPICard label="Generaron ODP Hija" value={d.nc_con_odp_hija} color="amber"
              desc="NC que derivaron en la creación de una nueva ODP para corregir el defecto (retrabajos). Cada ODP hija tiene un costo adicional de producción." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {/* Por estado */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Por Estado</p>
                <InfoTooltip text="ABIERTO = recién reportada, sin acción. EN_PROCESO = en corrección activa. CERRADO = resuelta y verificada." />
              </div>
              <div className="space-y-2">
                {['ABIERTO', 'EN_PROCESO', 'CERRADO'].map(e => {
                  const row = d.por_estado?.find((r: any) => r.estado === e);
                  const n = row?.total || 0;
                  const color = e === 'CERRADO' ? 'bg-emerald-400' : e === 'EN_PROCESO' ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <div key={e} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-xs text-slate-600 flex-1 capitalize">{e.replace('_', ' ')}</span>
                      <span className="text-sm font-bold text-slate-800">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Por tipo */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Por Tipo</p>
                <InfoTooltip text="Error Interno = fallo en proceso interno. Daño en Planta = daño físico ocurrido en planta. Reproceso = producto que debe rehacerse. Queja = insatisfacción del cliente." />
              </div>
              <div className="space-y-2">
                {d.por_tipo?.map((r: any) => (
                  <div key={r.tipo} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{LABELS_TIPO[r.tipo] || r.tipo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{r.total}</span>
                      {r.costo > 0 && <span className="text-xs text-red-500">{COP(r.costo)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top responsables */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Top Responsables</p>
                <InfoTooltip text="Personas con mayor número de NC asignadas como responsables del error. Permite identificar áreas o personas que generan más incidentes de calidad." />
              </div>
              <div className="space-y-2">
                {d.top_responsables?.map((r: any) => (
                  <div key={r.responsable} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 truncate">{r.responsable}</span>
                    <span className="text-sm font-bold text-slate-800 ml-2">{r.total}</span>
                  </div>
                ))}
                {(!d.top_responsables || d.top_responsables.length === 0) && (
                  <p className="text-xs text-slate-400">Sin datos</p>
                )}
              </div>
            </div>
          </div>

          {/* Áreas */}
          {d.por_area?.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Por Área</p>
                <InfoTooltip text="Distribución de NC por área donde ocurrió el error (corte, vidrio, ensamble, instalación, etc.). Muestra en qué parte del proceso se concentran los problemas." />
              </div>
              <div className="flex flex-wrap gap-2">
                {d.por_area.map((r: any) => (
                  <div key={r.area} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-slate-600">{r.area}</span>
                    <span className="ml-2 font-bold text-slate-800">{r.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle NC */}
          <div>
            <button onClick={() => setMostrarDetalle(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2 hover:text-slate-800 transition">
              {mostrarDetalle ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Ver detalle de NC ({d.nc_detalle?.length || 0})
            </button>
            {mostrarDetalle && d.nc_detalle?.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 font-bold text-slate-600 uppercase">
                    <th className="text-left px-3 py-2">Reporte</th>
                    <th className="text-left px-3 py-2">ODP</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Área</th>
                    <th className="text-left px-3 py-2">Responsable</th>
                    <th className="text-right px-3 py-2">Costo</th>
                    <th className="text-left px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.nc_detalle.map((n: any) => (
                    <tr key={n.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono">{n.numero_reporte}</td>
                      <td className="px-3 py-1.5">{n.odp || '—'}</td>
                      <td className="px-3 py-1.5">{LABELS_TIPO[n.tipo_error] || n.tipo_error}</td>
                      <td className="px-3 py-1.5">{n.area_error || '—'}</td>
                      <td className="px-3 py-1.5">{n.responsable || '—'}</td>
                      <td className="px-3 py-1.5 text-right text-red-600">{n.costo_total > 0 ? COP(n.costo_total) : '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          n.estado === 'CERRADO' ? 'bg-emerald-100 text-emerald-700' :
                          n.estado === 'EN_PROCESO' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>{n.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Tab 6: Recomendaciones ───────────────────────────────────────────────────

const TabRecomendaciones: React.FC = () => {
  const [desde, setDesde] = useState(hace7dias());
  const [hasta, setHasta] = useState(hoy());
  const [data, setData] = useState<{ alertas: unknown[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState<string>('todas');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ desde, hasta });
      const r = await fetch(`${API}/api/informe-ejecutivo/recomendaciones?${p}`, { headers: headers() });
      setData(await r.json());
    } finally { setLoading(false); }
  }, [desde, hasta]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const alertas = ((data?.alertas || []) as any[]).filter(a => areaFiltro === 'todas' || a.area === areaFiltro);

  return (
    <div>
      <Filtros desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta}
        onRefresh={fetch_} loading={loading} />

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-bold text-slate-500">Filtrar área:</span>
        {['todas', 'produccion', 'comercial', 'finanzas', 'calidad'].map(a => (
          <button key={a} onClick={() => setAreaFiltro(a)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition capitalize ${areaFiltro === a ? 'bg-slate-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {a === 'todas' ? 'Todas' : a}
          </button>
        ))}
      </div>

      {alertas.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="font-bold text-slate-700">Sin alertas para el período seleccionado</p>
          <p className="text-xs text-slate-400">El sistema no detectó deficiencias críticas</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /><strong>Crítico:</strong> Acción inmediata — impacto alto en operación o finanzas.</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /><strong>Moderado:</strong> Atender esta semana — riesgo de escalamiento.</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /><strong>Atención:</strong> Punto de mejora sin urgencia inmediata.</span>
          </div>
          <div className="space-y-3">
          {alertas.map((a, i) => (
            <div key={i} className={`border rounded-xl p-4 ${
              a.nivel === 'critico'  ? 'bg-red-50 border-red-200' :
              a.nivel === 'moderado' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <NivelBadge nivel={a.nivel} />
                  <AreaBadge  area={a.area} />
                </div>
              </div>
              <p className="font-bold text-slate-800 text-sm mb-1">{a.titulo}</p>
              <p className="text-xs text-slate-600 mb-2">{a.descripcion}</p>
              <div className="flex items-start gap-1.5 bg-white/60 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-700 font-medium"><strong>Acción sugerida:</strong> {a.accion}</p>
              </div>
            </div>
          ))}
          </div>
        </>
      )}

      {data && data.total > 0 && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs font-bold text-slate-500">
            Total: {data.total} alerta{data.total !== 1 ? 's' : ''} detectada{data.total !== 1 ? 's' : ''} •
            {' '}{(data.alertas as any[]).filter(a => a.nivel === 'critico').length} crítica{(data.alertas as any[]).filter(a => a.nivel === 'critico').length !== 1 ? 's' : ''} •
            {' '}{(data.alertas as any[]).filter(a => a.nivel === 'moderado').length} moderada{(data.alertas as any[]).filter(a => a.nivel === 'moderado').length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Página Principal ─────────────────────────────────────────────────────────

const InformeEjecutivoPage: React.FC = () => {
  const [tab, setTab] = useState('resumen');
  const [asesores, setAsesores] = useState<{ id: number; nombre: string }[]>([]);

  useEffect(() => {
    fetch(`${API}/api/usuarios`, { headers: headers() })
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : (data.usuarios || []);
        const rolesComerciales = ['asesor_comercial', 'gerencia', 'jefe_produccion'];
        setAsesores(
          lista
            .filter((u: any) => rolesComerciales.includes(u.rol))
            .map((u: any) => ({ id: u.id, nombre: u.nombre_completo || u.nombre }))
        );
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl shadow">
          <BarChart2 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Informe Ejecutivo Semanal</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Visión gerencial completa del sistema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 mb-6">
        {TABS_CONFIG.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'resumen'         && <TabResumen       asesores={asesores} />}
        {tab === 'asesores'        && <TabAsesores      asesores={asesores} />}
        {tab === 'produccion'      && <TabProduccion    asesores={asesores} />}
        {tab === 'financiero'      && <TabFinanciero    asesores={asesores} />}
        {tab === 'calidad'         && <TabCalidad />}
        {tab === 'recomendaciones' && <TabRecomendaciones />}
      </div>
    </div>
  );
};

export default InformeEjecutivoPage;
