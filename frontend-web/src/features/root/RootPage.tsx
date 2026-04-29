import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, Database, Cloud, Activity, ClipboardList,
  HardDrive, Wrench, Bell, BookOpen, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Download,
  Upload, RotateCcw, Trash2, ChevronRight, Cpu,
  Wifi, WifiOff, Clock, BarChart2, Lock, X
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${sessionStorage.getItem('token')}`,
});

// ─── Sub-componentes de UI ────────────────────────────────────────────────────
const GaugeBar: React.FC<{ pct: number; label: string; detail?: string }> = ({ pct, label, detail }) => {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-xs font-bold text-slate-800">{pct}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {detail && <p className="text-[11px] text-slate-400 mt-0.5">{detail}</p>}
    </div>
  );
};

const StatusBadge: React.FC<{ status: 'online' | 'offline' | 'slow' }> = ({ status }) => {
  const map = {
    online: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'ONLINE' },
    offline: { bg: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3.5 h-3.5" />, label: 'OFFLINE' },
    slow: { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'LENTO' },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold ${s.bg}`}>
      {s.icon} {s.label}
    </span>
  );
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'resumen',       label: 'Resumen',        icon: Shield },
  { id: 'diagnostico',   label: 'Diagnóstico',     icon: AlertTriangle },
  { id: 'operativo',     label: 'Operativo',       icon: BarChart2 },
  { id: 'seguridad',     label: 'Seguridad',       icon: Lock },
  { id: 'supabase',      label: 'Base de Datos',   icon: Database },
  { id: 'cloudinary',    label: 'Almacenamiento',  icon: Cloud },
  { id: 'servicios',     label: 'Servicios',       icon: Activity },
  { id: 'auditoria',     label: 'Auditoría',       icon: ClipboardList },
  { id: 'backup',        label: 'Backup',          icon: HardDrive },
  { id: 'mantenimiento', label: 'Mantenimiento',   icon: Wrench },
  { id: 'alertas',       label: 'Alertas',         icon: Bell },
  { id: 'catalogo',      label: 'Catálogo',        icon: BookOpen },
];

// ─── RootPage ─────────────────────────────────────────────────────────────────
const RootPage: React.FC = () => {
  const [tab, setTab] = useState('resumen');
  const [alertCounts, setAlertCounts] = useState({ diagnostico_criticos: 0, operativo_issues: 0 });

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/root/diagnostico/odp`,  { headers: headers() }).then(r => r.json()),
      fetch(`${API}/api/root/operativo/resumen`, { headers: headers() }).then(r => r.json()),
    ]).then(([diag, op]) => {
      setAlertCounts({
        diagnostico_criticos: diag?.resumen?.criticos ?? 0,
        operativo_issues:     op?.resumen?.total_issues ?? 0,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Panel ROOT</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Control total del sistema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 mb-6">
        {TABS.map(t => {
          const Icon = t.icon;
          const badge =
            t.id === 'diagnostico' && alertCounts.diagnostico_criticos > 0 ? alertCounts.diagnostico_criticos :
            t.id === 'operativo'   && alertCounts.operativo_issues > 0     ? alertCounts.operativo_issues :
            null;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
              {badge !== null && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[9px] font-extrabold rounded-full text-white ${
                  t.id === 'diagnostico' ? 'bg-red-500' : 'bg-amber-500'
                }`}>{badge > 9 ? '9+' : badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'resumen'       && <TabResumen setTab={setTab} alertCounts={alertCounts} />}
        {tab === 'diagnostico'   && <TabDiagnostico onAlertas={(n) => setAlertCounts(a => ({ ...a, diagnostico_criticos: n }))} />}
        {tab === 'operativo'     && <TabOperativo   onAlertas={(n) => setAlertCounts(a => ({ ...a, operativo_issues: n }))} />}
        {tab === 'seguridad'     && <TabSeguridad />}
        {tab === 'supabase'      && <TabSupabase />}
        {tab === 'cloudinary'    && <TabCloudinary />}
        {tab === 'servicios'     && <TabServicios />}
        {tab === 'auditoria'     && <TabAuditoria />}
        {tab === 'backup'        && <TabBackup />}
        {tab === 'mantenimiento' && <TabMantenimiento />}
        {tab === 'alertas'       && <TabAlertas />}
        {tab === 'catalogo'      && <TabCatalogo />}
      </div>
    </div>
  );
};

// ─── Tab Resumen ──────────────────────────────────────────────────────────────
const TabResumen: React.FC<{ setTab: (t: string) => void; alertCounts: { diagnostico_criticos: number; operativo_issues: number } }> = ({ setTab, alertCounts }) => {
  const [sbData, setSbData] = useState<any>(null);
  const [cdData, setCdData] = useState<any>(null);
  const [svData, setSvData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/root/metricas/supabase`, { headers: headers() }).then(r => r.json()),
      fetch(`${API}/api/root/metricas/cloudinary`, { headers: headers() }).then(r => r.json()),
      fetch(`${API}/api/root/servicios/health`, { headers: headers() }).then(r => r.json()),
    ]).then(([sb, cd, sv]) => {
      setSbData(sb);
      setCdData(cd);
      setSvData(sv);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-slate-400 font-semibold animate-pulse">Cargando resumen del sistema...</div>;

  const serviciosOffline = svData?.servicios?.filter((s: any) => s.status !== 'online') || [];
  const totalAlertas = alertCounts.diagnostico_criticos + alertCounts.operativo_issues;

  return (
    <div className="space-y-6">
      {/* Alertas activas de servicios */}
      {serviciosOffline.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {serviciosOffline.length} servicio(s) con problemas</p>
          {serviciosOffline.map((s: any) => (
            <p key={s.name} className="text-xs text-red-600">• {s.name} — {s.status.toUpperCase()} ({s.responseMs}ms)</p>
          ))}
        </div>
      )}

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition" onClick={() => setTab('supabase')}>
          <Database className="w-5 h-5 text-indigo-500 mb-2" />
          <p className="text-2xl font-black text-slate-800">{sbData?.db_pct ?? '—'}%</p>
          <p className="text-xs text-slate-500 font-semibold">BD usada · {sbData?.db_size ?? '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition" onClick={() => setTab('cloudinary')}>
          <Cloud className="w-5 h-5 text-sky-500 mb-2" />
          <p className="text-2xl font-black text-slate-800">{cdData?.storage?.pct ?? '—'}%</p>
          <p className="text-xs text-slate-500 font-semibold">Storage · {cdData?.storage?.usado_gb ?? '—'} GB</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition" onClick={() => setTab('servicios')}>
          <Activity className="w-5 h-5 text-emerald-500 mb-2" />
          <p className="text-2xl font-black text-slate-800">{svData?.servicios?.filter((s: any) => s.status === 'online').length ?? '—'}/{svData?.servicios?.length ?? '—'}</p>
          <p className="text-xs text-slate-500 font-semibold">Servicios online</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition" onClick={() => setTab('supabase')}>
          <Cpu className="w-5 h-5 text-violet-500 mb-2" />
          <p className="text-2xl font-black text-slate-800">{sbData?.conexiones?.total ?? '—'}</p>
          <p className="text-xs text-slate-500 font-semibold">Conexiones BD activas</p>
        </div>
      </div>

      {/* Mini gauges */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Capacidad del sistema</h3>
        {sbData && <GaugeBar pct={sbData.db_pct} label="Base de datos (Supabase)" detail={`${sbData.db_mb} MB / ${sbData.limites?.db_mb} MB`} />}
        {cdData && <GaugeBar pct={cdData.storage?.pct} label="Almacenamiento (Cloudinary)" detail={`${cdData.storage?.usado_gb} GB / ${cdData.storage?.limite_gb} GB`} />}
        {cdData && <GaugeBar pct={cdData.bandwidth?.pct} label="Ancho de banda (Cloudinary)" detail={`${cdData.bandwidth?.usado_gb} GB / ${cdData.bandwidth?.limite_gb} GB`} />}
        {sbData && <GaugeBar pct={sbData.conexiones?.pct} label="Conexiones BD" detail={`${sbData.conexiones?.total} / ${sbData.conexiones?.limite}`} />}
      </div>

      {/* Alertas del Sistema (operativo) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Alertas del Sistema</h3>
        {totalAlertas === 0 ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">Todo en orden — sin alertas operativas activas</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              onClick={() => setTab('diagnostico')}
              className={`cursor-pointer rounded-xl border p-4 transition hover:shadow-md ${alertCounts.diagnostico_criticos > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Diagnóstico ODP</span>
                {alertCounts.diagnostico_criticos > 0 && (
                  <span className="text-xs font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{alertCounts.diagnostico_criticos} críticos</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">ODPs en LISTO_INSTALAR con inconsistencias de flujo</p>
            </div>
            <div
              onClick={() => setTab('operativo')}
              className={`cursor-pointer rounded-xl border p-4 transition hover:shadow-md ${alertCounts.operativo_issues > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Resumen Operativo</span>
                {alertCounts.operativo_issues > 0 && (
                  <span className="text-xs font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{alertCounts.operativo_issues} issues</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">NC abiertas, PV en problema, créditos vencidos, rutas</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Tab Supabase ─────────────────────────────────────────────────────────────
const TabSupabase: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/root/metricas/supabase`, { headers: headers() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Cargando métricas...</div>;
  if (!data || data.error) return <div className="text-red-500 p-4">{data?.error || 'Error al cargar'}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Tamaño BD', val: data.db_size, sub: `${data.db_pct}% del límite` },
          { label: 'Límite plan free', val: `${data.limites?.db_mb} MB`, sub: 'Plan Supabase Free' },
          { label: 'Tablas', val: data.tabla_count, sub: 'En esquema public' },
          { label: 'Conexiones activas', val: data.conexiones?.total, sub: `Límite: ${data.conexiones?.limite}` },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-black text-slate-800">{c.val}</p>
            <p className="text-xs font-bold text-slate-500 mt-0.5">{c.label}</p>
            <p className="text-[11px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <GaugeBar pct={data.db_pct} label="Almacenamiento BD" detail={`${data.db_mb} MB / ${data.limites?.db_mb} MB`} />
        <GaugeBar pct={data.conexiones?.pct} label="Conexiones" detail={`${data.conexiones?.total} activas / ${data.conexiones?.limite} máx`} />
      </div>
      {/* Detalle de conexiones */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">
            Conexiones activas
            <span className="ml-2 text-xs font-normal text-slate-400">
              {data.conexiones?.activas} activas · {data.conexiones?.inactivas} idle
            </span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">PID</th>
                <th className="text-left px-4 py-2 font-semibold">Aplicación</th>
                <th className="text-left px-4 py-2 font-semibold">Usuario</th>
                <th className="text-left px-4 py-2 font-semibold">IP</th>
                <th className="text-center px-4 py-2 font-semibold">Estado</th>
                <th className="text-left px-4 py-2 font-semibold">Inicio</th>
                <th className="text-left px-4 py-2 font-semibold">Última query</th>
              </tr>
            </thead>
            <tbody>
              {data.conexiones?.detalle?.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-slate-400">Sin conexiones</td></tr>
              )}
              {data.conexiones?.detalle?.map((c: any) => (
                <tr key={c.pid} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-1.5 font-mono text-slate-500">{c.pid}</td>
                  <td className="px-4 py-1.5 text-slate-700 font-medium">{c.application_name}</td>
                  <td className="px-4 py-1.5 text-slate-500">{c.usename}</td>
                  <td className="px-4 py-1.5 font-mono text-slate-500">{c.client_addr}</td>
                  <td className="px-4 py-1.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      c.state === 'active'
                        ? 'bg-green-100 text-green-700'
                        : c.state === 'idle'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {c.state}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 font-mono text-slate-400">{c.query_start}</td>
                  <td className="px-4 py-1.5 text-slate-400 max-w-[260px] truncate" title={c.ultima_query}>{c.ultima_query}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tamaño por tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Tamaño por tabla</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Tabla</th>
                <th className="text-right px-4 py-2 font-semibold">Tamaño</th>
                <th className="text-right px-4 py-2 font-semibold">Columnas</th>
              </tr>
            </thead>
            <tbody>
              {data.tablas?.map((t: any) => (
                <tr key={t.tablename} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{t.tablename}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{t.size_pretty}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{t.column_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Tab Cloudinary ───────────────────────────────────────────────────────────
const TabCloudinary: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/root/metricas/cloudinary`, { headers: headers() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Cargando métricas...</div>;
  if (!data || data.error) return <div className="text-red-500 p-4">{data?.error || 'Error al cargar'}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Storage usado', val: `${data.storage?.usado_gb} GB`, sub: `Límite: ${data.storage?.limite_gb} GB` },
          { label: 'Bandwidth usado', val: `${data.bandwidth?.usado_gb} GB`, sub: `Límite: ${data.bandwidth?.limite_gb} GB` },
          { label: 'Imágenes', val: data.recursos?.imagenes, sub: `Total archivos: ${data.recursos?.total_archivos}` },
          { label: 'Transformaciones', val: data.transformaciones?.usadas, sub: `Límite: ${data.transformaciones?.limite}` },
          { label: 'Plan', val: data.plan || 'Free', sub: 'Cloudinary' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-2xl font-black text-slate-800">{c.val}</p>
            <p className="text-xs font-bold text-slate-500 mt-0.5">{c.label}</p>
            <p className="text-[11px] text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <GaugeBar pct={data.storage?.pct} label="Storage" detail={`${data.storage?.usado_gb} GB / ${data.storage?.limite_gb} GB`} />
        <GaugeBar pct={data.bandwidth?.pct} label="Ancho de banda" detail={`${data.bandwidth?.usado_gb} GB / ${data.bandwidth?.limite_gb} GB`} />
        <GaugeBar pct={data.transformaciones?.pct} label="Transformaciones" detail={`${data.transformaciones?.usadas} / ${data.transformaciones?.limite}`} />
      </div>
    </div>
  );
};

// ─── Tab Servicios ────────────────────────────────────────────────────────────
const TabServicios: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/root/servicios/health`, { headers: headers() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-600">Estado de servicios externos</h2>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>
      {loading ? (
        <div className="text-center py-16 text-slate-400 animate-pulse">Verificando servicios...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.servicios?.map((s: any) => (
            <div key={s.name} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {s.status === 'online' ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                <div>
                  <p className="text-sm font-bold text-slate-700">{s.name}</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{s.url}</p>
                </div>
              </div>
              <div className="text-right">
                <StatusBadge status={s.status} />
                <p className="text-[11px] text-slate-400 mt-1">{s.responseMs}ms</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.timestamp && (
        <p className="text-[11px] text-slate-400 text-right flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" /> Última verificación: {new Date(data.timestamp).toLocaleString('es-CO')}
        </p>
      )}
    </div>
  );
};

// ─── Tab Auditoría ────────────────────────────────────────────────────────────
const TabAuditoria: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ tabla: '', operacion: '', page: 1 });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtros.tabla) params.set('tabla', filtros.tabla);
    if (filtros.operacion) params.set('operacion', filtros.operacion);
    params.set('page', String(filtros.page));
    params.set('limit', '50');
    fetch(`${API}/api/root/auditoria?${params}`, { headers: headers() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const revertir = async (id: number) => {
    if (!window.confirm('¿Revertir esta operación? El dato volverá a su estado anterior.')) return;
    setReverting(id);
    const res = await fetch(`${API}/api/root/auditoria/${id}/revertir`, { method: 'POST', headers: headers() });
    const json = await res.json();
    setReverting(null);
    if (json.ok) { alert('Operación revertida exitosamente'); cargar(); }
    else alert(json.error || 'Error al revertir');
  };

  const opColor = (op: string) => ({
    INSERT: 'bg-emerald-50 text-emerald-700',
    UPDATE: 'bg-amber-50 text-amber-700',
    DELETE: 'bg-red-50 text-red-700',
  }[op] || 'bg-slate-100 text-slate-600');

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <input
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-indigo-400 outline-none"
          placeholder="Tabla..."
          value={filtros.tabla}
          onChange={e => setFiltros(f => ({ ...f, tabla: e.target.value, page: 1 }))}
        />
        <select
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
          value={filtros.operacion}
          onChange={e => setFiltros(f => ({ ...f, operacion: e.target.value, page: 1 }))}
        >
          <option value="">Todas las ops</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
        {data && <span className="text-xs text-slate-400 self-center">{data.total} registros</span>}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 animate-pulse">Cargando auditoría...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
                <th className="text-left px-4 py-2.5 font-semibold">Op</th>
                <th className="text-left px-4 py-2.5 font-semibold">Tabla</th>
                <th className="text-left px-4 py-2.5 font-semibold">ID</th>
                <th className="text-left px-4 py-2.5 font-semibold">Usuario</th>
                <th className="text-left px-4 py-2.5 font-semibold">IP</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data?.registros?.map((r: any) => (
                <React.Fragment key={r.id}>
                  <tr className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                    <td className="px-4 py-2 text-slate-500">{new Date(r.fecha).toLocaleString('es-CO')}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${opColor(r.operacion)}`}>{r.operacion}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-600">{r.tabla}</td>
                    <td className="px-4 py-2 text-slate-500">{r.registro_id}</td>
                    <td className="px-4 py-2 text-slate-600">{r.usuario_nombre || r.usuario_id || '—'}</td>
                    <td className="px-4 py-2 text-slate-400">{r.ip_address || '—'}</td>
                    <td className="px-4 py-2 flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); revertir(r.id); }}
                        disabled={reverting === r.id}
                        className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-40"
                        title="Revertir"
                      >
                        <RotateCcw className="w-3 h-3" /> {reverting === r.id ? '...' : 'Revertir'}
                      </button>
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition ${expandedId === r.id ? 'rotate-90' : ''}`} />
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] font-bold text-slate-500 mb-1">Datos anteriores</p>
                            <pre className="text-[10px] bg-white border border-slate-200 rounded-lg p-2 overflow-auto max-h-40 text-slate-600">
                              {r.datos_anteriores ? JSON.stringify(r.datos_anteriores, null, 2) : 'null'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-slate-500 mb-1">Datos nuevos</p>
                            <pre className="text-[10px] bg-white border border-slate-200 rounded-lg p-2 overflow-auto max-h-40 text-slate-600">
                              {r.datos_nuevos ? JSON.stringify(r.datos_nuevos, null, 2) : 'null'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {data?.registros?.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Sin registros</td></tr>
              )}
            </tbody>
          </table>
          {/* Paginación */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-2 p-3 border-t border-slate-100">
              <button disabled={filtros.page <= 1} onClick={() => setFiltros(f => ({ ...f, page: f.page - 1 }))} className="text-xs px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Anterior</button>
              <span className="text-xs text-slate-500">Pág {filtros.page} / {data.pages}</span>
              <button disabled={filtros.page >= data.pages} onClick={() => setFiltros(f => ({ ...f, page: f.page + 1 }))} className="text-xs px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Siguiente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Tab Backup ───────────────────────────────────────────────────────────────
const TabBackup: React.FC = () => {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const descargar = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/api/root/backup/descargar`, { headers: headers() });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_templex_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  const restaurar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('¿Restaurar el backup? Se ejecutarán todos los INSERT del archivo en una transacción. Si falla alguno, se hace rollback.')) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const sql = await file.text();
      const res = await fetch(`${API}/api/root/backup/restaurar`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ sql }),
      });
      const json = await res.json();
      if (json.ok) setRestoreMsg({ type: 'ok', text: `Restaurado: ${json.statements} statements ejecutados.` });
      else setRestoreMsg({ type: 'error', text: json.error || 'Error al restaurar' });
    } finally { setRestoring(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Descargar */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Download className="w-5 h-5 text-indigo-500 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-800">Descargar Backup</h3>
            <p className="text-xs text-slate-500 mt-0.5">Genera un archivo <code className="bg-slate-100 px-1 rounded">.sql</code> con todos los datos de todas las tablas. Guárdalo en tu equipo local.</p>
          </div>
        </div>
        <button
          onClick={descargar}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          <Download className="w-4 h-4" /> {downloading ? 'Generando...' : 'Descargar backup.sql'}
        </button>
      </div>

      {/* Restaurar */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Upload className="w-5 h-5 text-amber-500 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-800">Restaurar Backup</h3>
            <p className="text-xs text-slate-500 mt-0.5">Sube un archivo <code className="bg-slate-100 px-1 rounded">.sql</code> previamente descargado. Se ejecuta en una transacción — si algo falla, se hace rollback automático.</p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".sql"
          onChange={restaurar}
          disabled={restoring}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
        />
        {restoring && <p className="text-xs text-amber-600 mt-2 font-semibold animate-pulse">Restaurando... esto puede tardar un momento.</p>}
        {restoreMsg && (
          <p className={`text-xs mt-2 font-semibold ${restoreMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {restoreMsg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5 inline mr-1" /> : <XCircle className="w-3.5 h-3.5 inline mr-1" />}
            {restoreMsg.text}
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Tab Mantenimiento ────────────────────────────────────────────────────────
const TAREAS = [
  { id: 'resumen_inconsistencias', label: 'Resumen de inconsistencias', desc: 'Vista global de registros con referencias rotas', method: 'GET' },
  { id: 'odc_huerfanas', label: 'ODCs huérfanas (sin ítems)', desc: 'Órdenes de compra sin ningún ítem asociado — posible pérdida de datos o creación manual incorrecta', method: 'GET', warning: true },
  { id: 'tm_inconsistencias', label: 'TMs con triángulo roto (TM↔ODP↔Prospecto)', desc: 'TMs vinculadas a ODP cuyo Prospecto no refleja la misma ODP — requiere corrección manual', method: 'GET', warning: true },
  { id: 'odps_inconsistentes', label: 'ODPs con estado inconsistente', desc: 'ODPs con combinaciones de estado inválidas', method: 'GET' },
  { id: 'pagos_huerfanos', label: 'Pagos huérfanos', desc: 'Pagos sin ODP asociada en el sistema', method: 'GET' },
  { id: 'integridad_referencial', label: 'Integridad referencial', desc: 'Verifica claves foráneas entre tablas principales', method: 'GET' },
  { id: 'usuarios_inactivos', label: 'Usuarios inactivos', desc: 'Usuarios activos sin actividad en más de 90 días', method: 'GET' },
  { id: 'sesiones_activas', label: 'Conexiones a BD', desc: 'Conexiones activas actuales a PostgreSQL', method: 'GET' },
  { id: 'limpiar_auditoria', label: 'Limpiar log de auditoría', desc: 'Elimina registros de auditoría anteriores a 180 días', method: 'POST', destructive: true },
];

const TabMantenimiento: React.FC = () => {
  const [resultados, setResultados] = useState<Record<string, any>>({});
  const [running, setRunning] = useState<string | null>(null);

  const ejecutar = async (tarea: typeof TAREAS[0]) => {
    setRunning(tarea.id);
    try {
      const url = `${API}/api/root/mantenimiento/${tarea.id}`;
      const res = await fetch(url, { method: tarea.method, headers: headers() });
      const json = await res.json();
      setResultados(r => ({ ...r, [tarea.id]: json }));
    } finally { setRunning(null); }
  };

  return (
    <div className="space-y-3">
      {TAREAS.map(tarea => {
        const resultado = resultados[tarea.id];
        return (
          <div key={tarea.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">{tarea.label}</p>
                <p className="text-xs text-slate-500">{tarea.desc}</p>
              </div>
              <button
                onClick={() => ejecutar(tarea)}
                disabled={running === tarea.id}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${tarea.destructive ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100'} disabled:opacity-40`}
              >
                {running === tarea.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {running === tarea.id ? 'Ejecutando...' : 'Ejecutar'}
              </button>
            </div>
            {resultado && tarea.id === 'odc_huerfanas' ? (
              <div className="mt-3">
                {resultado.cantidad === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-bold">
                    ✓ No hay ODCs huérfanas
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs font-bold mb-2">
                      ⚠ {resultado.cantidad} ODC{resultado.cantidad !== 1 ? 's' : ''} sin ítems detectada{resultado.cantidad !== 1 ? 's' : ''}
                    </div>
                    <div className="overflow-auto max-h-64 rounded-lg border border-slate-200">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-3 py-2">ODC</th>
                            <th className="text-left px-3 py-2">Tipo</th>
                            <th className="text-left px-3 py-2">Proveedor</th>
                            <th className="text-left px-3 py-2">Estado</th>
                            <th className="text-left px-3 py-2">Creada por</th>
                            <th className="text-left px-3 py-2">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultado.registros.map((r: any) => (
                            <tr key={r.id} className="border-t border-slate-100 hover:bg-amber-50">
                              <td className="px-3 py-1.5 font-bold text-amber-700">{r.numero_odc}</td>
                              <td className="px-3 py-1.5">{r.tipo}</td>
                              <td className="px-3 py-1.5 font-medium text-slate-700">{r.proveedor || '—'}</td>
                              <td className="px-3 py-1.5">{r.estado}</td>
                              <td className="px-3 py-1.5 text-slate-500">{r.creado_por || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-400">{r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleDateString('es-CO') : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : resultado && tarea.id === 'tm_inconsistencias' ? (
              <div className="mt-3">
                {resultado.total === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-bold">
                    ✓ Sin inconsistencias detectadas
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs font-bold mb-2">
                      ⚠ {resultado.total} registro{resultado.total !== 1 ? 's' : ''} con triángulo roto
                    </div>
                    <div className="overflow-auto max-h-64 rounded-lg border border-slate-200">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide">
                          <tr>
                            <th className="text-left px-3 py-2">TM</th>
                            <th className="text-left px-3 py-2">Estado TM</th>
                            <th className="text-left px-3 py-2">ODP vinculada</th>
                            <th className="text-left px-3 py-2">Prospecto</th>
                            <th className="text-left px-3 py-2">Estado PR</th>
                            <th className="text-left px-3 py-2">ODP en PR</th>
                            <th className="text-left px-3 py-2">Cliente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultado.registros.map((r: any) => (
                            <tr key={r.tm_id} className="border-t border-slate-100 hover:bg-amber-50">
                              <td className="px-3 py-1.5 font-bold text-amber-700">{r.numero_tm}</td>
                              <td className="px-3 py-1.5">{r.tm_estado}</td>
                              <td className="px-3 py-1.5 font-medium text-slate-700">{r.numero_odp || '—'}</td>
                              <td className="px-3 py-1.5 font-bold text-sky-700">{r.numero_prospecto}</td>
                              <td className="px-3 py-1.5">{r.pr_estado}</td>
                              <td className={`px-3 py-1.5 font-bold ${r.pr_odp_id ? 'text-slate-500' : 'text-red-600'}`}>
                                {r.pr_odp_id ? `ODP-${r.pr_odp_id}` : 'SIN ODP'}
                              </td>
                              <td className="px-3 py-1.5 text-slate-500">{r.cliente || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : resultado && (
              <pre className="mt-3 text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-48 text-slate-700">
                {JSON.stringify(resultado, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Tab Alertas ──────────────────────────────────────────────────────────────
const TabAlertas: React.FC = () => {
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/root/alertas`, { headers: headers() })
      .then(r => r.json()).then(setAlertas).finally(() => setLoading(false));
  }, []);

  const guardar = async (alerta: any) => {
    setSaving(alerta.id);
    await fetch(`${API}/api/root/alertas/${alerta.id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ valor: alerta.valor, activo: alerta.activo }),
    });
    setSaving(null);
  };

  const update = (id: number, changes: any) => {
    setAlertas(a => a.map(x => x.id === id ? { ...x, ...changes } : x));
  };

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Cargando umbrales...</div>;
  if (alertas.length === 0) return <div className="text-slate-400 p-4">No hay umbrales configurados. Ejecuta el SQL de inicialización en Supabase.</div>;

  return (
    <div className="space-y-3 max-w-2xl">
      {alertas.map(a => (
        <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">{a.nombre}</p>
            <p className="text-xs text-slate-500">{a.descripcion}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={a.valor}
                onChange={e => update(a.id, { valor: parseFloat(e.target.value) })}
                className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono text-center focus:ring-2 focus:ring-indigo-400 outline-none"
              />
              <span className="text-xs text-slate-400 font-semibold">{a.unidad}</span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={a.activo}
                onChange={e => update(a.id, { activo: e.target.checked })}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-xs text-slate-500">Activo</span>
            </label>
            <button
              onClick={() => guardar(a)}
              disabled={saving === a.id}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              {saving === a.id ? '...' : 'Guardar'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Tab Catálogo (movido desde Configuración) ────────────────────────────────
type CatItem = { id: number; categoria: string; nombre: string; descripcion: string; activo: boolean };

const TabCatalogo: React.FC = () => {
  const [catalogo, setCatalogo] = useState<CatItem[]>([]);
  const [catTab, setCatTab] = useState<string>('');
  const [catForm, setCatForm] = useState<Partial<CatItem> | null>(null);
  const [catEditing, setCatEditing] = useState<number | null>(null);
  const [catSaving, setCatSaving] = useState(false);

  const fetchCatalogo = useCallback(async () => {
    const res = await fetch(`${API}/api/catalogo/all`, { headers: headers() });
    if (res.ok) {
      const data: CatItem[] = await res.json();
      setCatalogo(data);
      setCatTab(prev => prev || (data.length > 0 ? data[0].categoria : ''));
    }
  }, []);

  useEffect(() => { fetchCatalogo(); }, [fetchCatalogo]);

  const catCategorias = Array.from(new Set(catalogo.map(i => i.categoria)));

  const saveCatItem = async () => {
    if (!catForm?.categoria || !catForm?.nombre) return;
    setCatSaving(true);
    if (catEditing) {
      await fetch(`${API}/api/catalogo/${catEditing}`, { method: 'PUT', headers: headers(), body: JSON.stringify(catForm) });
    } else {
      await fetch(`${API}/api/catalogo`, { method: 'POST', headers: headers(), body: JSON.stringify(catForm) });
    }
    setCatForm(null); setCatEditing(null); setCatSaving(false);
    fetchCatalogo();
  };

  const deleteCatItem = async (id: number) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    await fetch(`${API}/api/catalogo/${id}`, { method: 'DELETE', headers: headers() });
    fetchCatalogo();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Catálogo de Productos</h2>
          <p className="text-xs text-slate-500">Productos y servicios disponibles en el formulario ODP</p>
        </div>
        <button
          onClick={() => { setCatForm({ categoria: catTab || catCategorias[0] || '', nombre: '', descripcion: '', activo: true }); setCatEditing(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition"
        >
          + Nuevo Producto
        </button>
      </div>
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 mb-4">
        {catCategorias.map(cat => (
          <button key={cat} onClick={() => setCatTab(cat)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${catTab === cat ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            {cat}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {catalogo.filter(i => i.categoria === catTab).map(item => (
          <div key={item.id} className={`flex items-start gap-3 p-3 bg-white border rounded-xl ${!item.activo ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-slate-800">{item.nombre}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.descripcion}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => { setCatForm(item); setCatEditing(item.id); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition">✏️</button>
              <button onClick={() => deleteCatItem(item.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      {catForm !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{catEditing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={() => { setCatForm(null); setCatEditing(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría *</label>
                <input list="cat-list-root" value={catForm.categoria || ''} onChange={e => setCatForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none" />
                <datalist id="cat-list-root">{catCategorias.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input value={catForm.nombre || ''} onChange={e => setCatForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                <textarea value={catForm.descripcion || ''} onChange={e => setCatForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={3} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 resize-none outline-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={catForm.activo ?? true} onChange={e => setCatForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />
                <span className="text-sm text-slate-700 font-medium">Activo</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setCatForm(null); setCatEditing(null); }} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveCatItem} disabled={catSaving} className="px-4 py-2 text-sm bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700">
                {catSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── DiagSeccion (reutilizable) ───────────────────────────────────────────────
type Severidad = 'critico' | 'advertencia' | 'info';
const DiagSeccion: React.FC<{
  titulo: string;
  severidad: Severidad;
  registros: any[];
  columnas: { key: string; label: string; render?: (v: any, row: any) => React.ReactNode }[];
}> = ({ titulo, severidad, registros, columnas }) => {
  const [abierto, setAbierto] = useState(true);
  if (registros.length === 0) return null;

  const colores: Record<Severidad, { badge: string; header: string; border: string }> = {
    critico:     { badge: 'bg-red-100 text-red-700',    header: 'bg-red-50',    border: 'border-red-200' },
    advertencia: { badge: 'bg-amber-100 text-amber-700', header: 'bg-amber-50',  border: 'border-amber-200' },
    info:        { badge: 'bg-blue-100 text-blue-700',   header: 'bg-blue-50',   border: 'border-blue-200' },
  };
  const c = colores[severidad];

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden`}>
      <button
        className={`w-full flex items-center justify-between px-4 py-3 ${c.header} text-left`}
        onClick={() => setAbierto(a => !a)}
      >
        <span className="text-sm font-bold text-slate-800">{titulo}</span>
        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${c.badge}`}>{registros.length}</span>
      </button>
      {abierto && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {columnas.map(col => (
                  <th key={col.key} className="text-left px-3 py-2 font-semibold">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((row, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  {columnas.map(col => (
                    <td key={col.key} className="px-3 py-2 text-slate-700">
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Tab Diagnóstico ──────────────────────────────────────────────────────────
const TabDiagnostico: React.FC<{ onAlertas: (n: number) => void }> = ({ onAlertas }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const onAlertasRef = React.useRef(onAlertas);
  onAlertasRef.current = onAlertas;

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/root/diagnostico/odp`, { headers: headers() })
      .then(r => r.json())
      .then(d => { setData(d); onAlertasRef.current(d?.resumen?.criticos ?? 0); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-CO') : '—';
  const bool = (v: any) => v ? 'Sí' : 'No';

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Analizando ODPs...</div>;
  if (!data) return <div className="text-red-500 p-4">Error al cargar diagnóstico</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700">Diagnóstico de Flujo ODP</h2>
          <p className="text-xs text-slate-400">Inconsistencias en el pipeline de producción</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {data.resumen?.total === 0 ? (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">Sin inconsistencias detectadas — el flujo de producción está limpio</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-700">{data.resumen?.criticos}</p>
            <p className="text-[11px] font-bold text-red-500">Críticos</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-amber-700">{data.resumen?.advertencias}</p>
            <p className="text-[11px] font-bold text-amber-500">Advertencias</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-blue-700">{data.resumen?.info}</p>
            <p className="text-[11px] font-bold text-blue-500">Info</p>
          </div>
        </div>
      )}

      <DiagSeccion
        titulo="LISTO_INSTALAR sin ningún requisito"
        severidad="critico"
        registros={data.listo_sin_requisitos || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'asesor', label: 'Asesor' },
          { key: 'fecha_listo_instalar', label: 'Fecha listo', render: (v) => fmt(v) },
        ]}
      />

      <DiagSeccion
        titulo="LISTO_INSTALAR con chk_* pendientes"
        severidad="critico"
        registros={data.listo_chk_pendiente || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'tiene_tm', label: 'TMs', render: (v) => Number(v) },
          { key: 'tiene_items', label: 'Items', render: (v) => Number(v) },
          { key: 'tiene_sap', label: 'SAPs', render: (v) => Number(v) },
          { key: 'chk_medicion', label: 'Med.', render: (v) => bool(v) },
          { key: 'chk_vidrio', label: 'Vid.', render: (v) => bool(v) },
          { key: 'chk_corte', label: 'Corte', render: (v) => bool(v) },
          { key: 'chk_ensamble', label: 'Ens.', render: (v) => bool(v) },
        ]}
      />

      <DiagSeccion
        titulo="VISITA_TECNICA con TM ya realizada"
        severidad="advertencia"
        registros={data.visita_tm_realizada || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'numero_tm', label: 'TM' },
          { key: 'estado_tm', label: 'Estado TM' },
          { key: 'fecha_visita', label: 'Fecha visita', render: (v) => fmt(v) },
        ]}
      />

      <DiagSeccion
        titulo="EN_ESPERA sin cambio > 30 días"
        severidad="advertencia"
        registros={data.en_espera_stale || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'asesor', label: 'Asesor' },
          { key: 'dias_sin_cambio', label: 'Días sin cambio' },
          { key: 'ultimo_cambio', label: 'Último cambio', render: (v) => fmt(v) },
        ]}
      />

      <DiagSeccion
        titulo="ODPs sin_items pendientes de liberar"
        severidad="info"
        registros={data.sin_items_pendiente || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'asesor', label: 'Asesor' },
          { key: 'dias_esperando', label: 'Días esperando' },
          { key: 'fecha_creacion', label: 'Creada', render: (v) => fmt(v) },
        ]}
      />
    </div>
  );
};

// ─── Tab Operativo ────────────────────────────────────────────────────────────
const TabOperativo: React.FC<{ onAlertas: (n: number) => void }> = ({ onAlertas }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const onAlertasRef = React.useRef(onAlertas);
  onAlertasRef.current = onAlertas;

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/root/operativo/resumen`, { headers: headers() })
      .then(r => r.json())
      .then(d => { setData(d); onAlertasRef.current(d?.resumen?.total_issues ?? 0); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('es-CO') : '—';
  const cop = (v: any) => v != null ? Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : '—';

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Cargando KPIs operativos...</div>;
  if (!data) return <div className="text-red-500 p-4">Error al cargar resumen operativo</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-700">Resumen Operativo</h2>
          <p className="text-xs text-slate-400">KPIs de negocio críticos en tiempo real</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-700">{data.resumen?.criticos}</p>
          <p className="text-[11px] font-bold text-red-500">Críticos</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-amber-700">{data.resumen?.advertencias}</p>
          <p className="text-[11px] font-bold text-amber-500">Advertencias</p>
        </div>
        <div className={`rounded-xl p-3 text-center border ${data.resumen?.total_issues === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <p className={`text-2xl font-black ${data.resumen?.total_issues === 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{data.resumen?.total_issues}</p>
          <p className="text-[11px] font-bold text-slate-500">Total issues</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center flex items-center justify-center">
          {data.resumen?.total_issues === 0
            ? <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Todo OK</span>
            : <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Revisar</span>
          }
        </div>
      </div>

      <DiagSeccion
        titulo={`No Conformidades abiertas (${data.no_conformidades_abiertas?.count ?? 0})`}
        severidad="critico"
        registros={data.no_conformidades_abiertas?.registros || []}
        columnas={[
          { key: 'numero_reporte', label: 'Reporte' },
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'tipo_error', label: 'Tipo' },
          { key: 'estado', label: 'Estado' },
          { key: 'costo_total', label: 'Costo', render: (v) => cop(v) },
        ]}
      />

      <DiagSeccion
        titulo={`Pedidos PV en PROBLEMA (${data.pedidos_problema?.count ?? 0})`}
        severidad="critico"
        registros={data.pedidos_problema?.registros || []}
        columnas={[
          { key: 'numero_pedido', label: 'Pedido' },
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'tipo_problema', label: 'Problema' },
          { key: 'estado_reposicion', label: 'Reposición' },
        ]}
      />

      <DiagSeccion
        titulo={`Créditos vencidos (${data.creditos_vencidos?.count ?? 0})`}
        severidad="critico"
        registros={data.creditos_vencidos?.registros || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'fecha_vencimiento_credito', label: 'Venció', render: (v) => fmt(v) },
          { key: 'dias_vencido', label: 'Días vencido' },
          { key: 'pendiente', label: 'Pendiente', render: (v) => cop(v) },
        ]}
      />

      <DiagSeccion
        titulo={`Entregadas sin facturar (${data.entregadas_sin_facturar?.count ?? 0})`}
        severidad="advertencia"
        registros={data.entregadas_sin_facturar?.registros || []}
        columnas={[
          { key: 'numero_odp', label: 'ODP' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'asesor', label: 'Asesor' },
          { key: 'valor_total', label: 'Valor', render: (v) => cop(v) },
          { key: 'fecha_entrega', label: 'Entregada', render: (v) => fmt(v) },
        ]}
      />

      <DiagSeccion
        titulo={`Rutas en curso sin cerrar (${data.rutas_en_curso?.count ?? 0})`}
        severidad="advertencia"
        registros={data.rutas_en_curso?.registros || []}
        columnas={[
          { key: 'id', label: 'ID Ruta' },
          { key: 'conductor', label: 'Conductor' },
          { key: 'creado_por', label: 'Creada por' },
          { key: 'horas_abiertas', label: 'Horas abiertas' },
          { key: 'inicio_ruta', label: 'Inicio', render: (v) => v ? new Date(v).toLocaleString('es-CO') : '—' },
        ]}
      />
    </div>
  );
};

// ─── Tab Seguridad ────────────────────────────────────────────────────────────
type FiltroOp = 'all' | 'INSERT' | 'UPDATE' | 'DELETE';

const FILTRO_LABEL: Record<FiltroOp, string> = { all: 'Todos', INSERT: 'Inserts', UPDATE: 'Updates', DELETE: 'Deletes' };
const FILTRO_ACTIVO: Record<FiltroOp, string> = {
  all: 'bg-slate-200 text-slate-700',
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};
const OP_CHIP: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};
const CAMPOS_OMITIR = new Set(['createdAt', 'updatedAt', 'password', '_auditAntes', '__v']);

function calcDiff(ant: any, nuevo: any, op: string): { campo: string; ant: unknown; nuevo: unknown }[] {
  if (op === 'INSERT') {
    if (!nuevo) return [];
    return Object.entries(nuevo).filter(([k]) => !CAMPOS_OMITIR.has(k)).slice(0, 12)
      .map(([k, v]) => ({ campo: k, ant: undefined, nuevo: v }));
  }
  if (op === 'DELETE') {
    if (!ant) return [];
    return Object.entries(ant).filter(([k]) => !CAMPOS_OMITIR.has(k)).slice(0, 12)
      .map(([k, v]) => ({ campo: k, ant: v, nuevo: undefined }));
  }
  const a = ant || {};
  const n = nuevo || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(n)].filter(k => !CAMPOS_OMITIR.has(k)));
  return Array.from(keys).filter(k => JSON.stringify(a[k]) !== JSON.stringify(n[k]))
    .map(k => ({ campo: k, ant: a[k], nuevo: n[k] }));
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v).slice(0, 80);
}

const TabSeguridad: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDelete, setExpandedDelete] = useState<number | null>(null);

  const [drawerUsuario, setDrawerUsuario] = useState<any | null>(null);
  const [drawerOps, setDrawerOps] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerPage, setDrawerPage] = useState(1);
  const [drawerTotal, setDrawerTotal] = useState(0);
  const [drawerPages, setDrawerPages] = useState(1);
  const [drawerFiltro, setDrawerFiltro] = useState<FiltroOp>('all');

  const cargar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/root/seguridad/actividad`, { headers: headers() })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarDetalle = useCallback((userId: number, page: number, filtro: FiltroOp) => {
    setDrawerLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filtro !== 'all') params.set('operacion', filtro);
    fetch(`${API}/api/root/seguridad/detalle-usuario/${userId}?${params}`, { headers: headers() })
      .then(r => r.json())
      .then(d => { setDrawerOps(d.data ?? []); setDrawerTotal(d.total ?? 0); setDrawerPages(d.pages ?? 1); })
      .finally(() => setDrawerLoading(false));
  }, []);

  useEffect(() => {
    if (drawerUsuario) cargarDetalle(drawerUsuario.usuario_id, drawerPage, drawerFiltro);
  }, [drawerUsuario, drawerPage, drawerFiltro, cargarDetalle]);

  const abrirDrawer = (u: any) => { setDrawerFiltro('all'); setDrawerPage(1); setDrawerUsuario(u); };

  if (loading) return <div className="text-center py-16 text-slate-400 animate-pulse">Cargando actividad de seguridad...</div>;
  if (!data) return <div className="text-red-500 p-4">Error al cargar datos de seguridad</div>;

  return (
    <>
      {/* ── DRAWER DETALLE USUARIO ── */}
      {drawerUsuario && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerUsuario(null)} />
          <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full">
            {/* Cabecera */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-800">{drawerUsuario.usuario_nombre}</h2>
                <p className="text-[11px] text-slate-400">
                  {drawerUsuario.rol} · #{drawerUsuario.usuario_id} · {drawerTotal} operaciones en 7 días
                </p>
              </div>
              <button onClick={() => setDrawerUsuario(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filtros */}
            <div className="px-5 py-3 border-b border-slate-100 flex gap-2 shrink-0 flex-wrap">
              {(['all', 'INSERT', 'UPDATE', 'DELETE'] as FiltroOp[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setDrawerFiltro(f); setDrawerPage(1); }}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full transition border ${
                    drawerFiltro === f ? FILTRO_ACTIVO[f] + ' border-current' : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'
                  }`}
                >
                  {FILTRO_LABEL[f]}
                </button>
              ))}
            </div>

            {/* Tabla de operaciones */}
            <div className="flex-1 overflow-y-auto">
              {drawerLoading ? (
                <div className="text-center py-12 text-slate-400 animate-pulse text-xs">Cargando operaciones...</div>
              ) : drawerOps.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">Sin operaciones con este filtro</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Fecha</th>
                      <th className="text-left px-4 py-2 font-semibold">Tabla</th>
                      <th className="text-left px-4 py-2 font-semibold">Op.</th>
                      <th className="text-left px-4 py-2 font-semibold">ID</th>
                      <th className="text-left px-4 py-2 font-semibold">¿Qué cambió?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drawerOps.map((op: any, i: number) => {
                      const diffs = calcDiff(op.datos_anteriores, op.datos_nuevos, op.operacion);
                      return (
                        <tr key={op.id ?? i} className="border-t border-slate-50 hover:bg-slate-50 align-top">
                          <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                            {op.fecha ? new Date(op.fecha).toLocaleString('es-CO') : '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{op.tabla}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${OP_CHIP[op.operacion] ?? 'bg-slate-100 text-slate-500'}`}>
                              {op.operacion}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-400">{op.registro_id ?? '—'}</td>
                          <td className="px-4 py-2.5 max-w-xs">
                            {diffs.length === 0 ? (
                              <span className="text-slate-300 italic">sin datos</span>
                            ) : (
                              <div className="space-y-0.5">
                                {diffs.map((d, di) => (
                                  <div key={di} className="flex flex-wrap items-center gap-1">
                                    <span className="font-mono text-slate-500">{d.campo}:</span>
                                    {op.operacion === 'UPDATE' ? (
                                      <>
                                        <span className="text-red-400 line-through">{fmtVal(d.ant)}</span>
                                        <span className="text-slate-300">→</span>
                                        <span className="text-emerald-600 font-semibold">{fmtVal(d.nuevo)}</span>
                                      </>
                                    ) : op.operacion === 'INSERT' ? (
                                      <span className="text-emerald-600">{fmtVal(d.nuevo)}</span>
                                    ) : (
                                      <span className="text-red-500">{fmtVal(d.ant)}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {drawerPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-400">Página {drawerPage} de {drawerPages} · {drawerTotal} total</span>
                <div className="flex gap-2">
                  <button disabled={drawerPage <= 1} onClick={() => setDrawerPage(p => p - 1)}
                    className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-semibold">
                    ← Anterior
                  </button>
                  <button disabled={drawerPage >= drawerPages} onClick={() => setDrawerPage(p => p + 1)}
                    className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-semibold">
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-700">Monitoreo de Seguridad</h2>
            <p className="text-xs text-slate-400">Actividad del sistema — últimos 7 días</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400">
              {data.generado_en ? new Date(data.generado_en).toLocaleString('es-CO') : ''}
            </span>
            <button onClick={cargar} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </button>
          </div>
        </div>

        {/* Actividad usuarios 7 días */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">Actividad de usuarios — últimos 7 días</h3>
            <span className="text-[11px] text-slate-400">{data.actividad_usuarios_7d?.length ?? 0} usuarios activos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Usuario</th>
                  <th className="text-left px-3 py-2 font-semibold">Rol</th>
                  <th className="text-right px-3 py-2 font-semibold">Total</th>
                  <th className="text-left px-3 py-2 font-semibold">Acciones</th>
                  <th className="text-left px-3 py-2 font-semibold">Tablas</th>
                  <th className="text-left px-3 py-2 font-semibold">IP(s)</th>
                  <th className="text-left px-3 py-2 font-semibold">Última actividad</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.actividad_usuarios_7d?.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-slate-400">Sin actividad en los últimos 7 días</td></tr>
                )}
                {data.actividad_usuarios_7d?.map((u: any, i: number) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-700">
                      {u.usuario_nombre}
                      <span className="ml-1 text-[10px] text-slate-400 font-normal">#{u.usuario_id}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{u.rol}</td>
                    <td className="px-3 py-2 text-right font-bold text-indigo-700">{u.cant_operaciones}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{u.inserts} ins</span>
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{u.updates} upd</span>
                        {Number(u.deletes) > 0
                          ? <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{u.deletes} del</span>
                          : <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">0 del</span>
                        }
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(u.tablas_tocadas) && u.tablas_tocadas.filter(Boolean).slice(0, 4).map((t: string) => (
                          <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{t}</span>
                        ))}
                        {Array.isArray(u.tablas_tocadas) && u.tablas_tocadas.filter(Boolean).length > 4 && (
                          <span className="text-[10px] text-slate-400">+{u.tablas_tocadas.filter(Boolean).length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-[11px]">{Array.isArray(u.ips) ? u.ips.filter(Boolean).join(', ') : '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{u.ultima_actividad ? new Date(u.ultima_actividad).toLocaleString('es-CO') : '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => abrirDrawer(u)}
                        className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                        Ver detalle <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* IPs únicas 7 días */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700">IPs únicas — últimos 7 días</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">IP</th>
                  <th className="text-right px-3 py-2 font-semibold">Requests</th>
                  <th className="text-right px-3 py-2 font-semibold">Usuarios</th>
                  <th className="text-left px-3 py-2 font-semibold">Quiénes operaron</th>
                  <th className="text-left px-3 py-2 font-semibold">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {data.ips_unicas_7d?.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-slate-400">Sin IPs registradas</td></tr>
                )}
                {data.ips_unicas_7d?.map((ip: any, i: number) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-slate-700">{ip.ip_address || '—'}</td>
                    <td className="px-3 py-2 text-right font-bold text-indigo-700">{ip.cant_requests}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{ip.cant_usuarios}</td>
                    <td className="px-3 py-2 text-slate-600 text-[11px]">{Array.isArray(ip.usuarios) ? ip.usuarios.filter(Boolean).join(', ') : '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{ip.ultima_actividad ? new Date(ip.ultima_actividad).toLocaleString('es-CO') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DELETEs últimos 7 días */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">DELETEs — últimos 7 días</h3>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${data.deletes_recientes_7d?.length > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
              {data.deletes_recientes_7d?.length ?? 0}
            </span>
          </div>
          {data.deletes_recientes_7d?.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-400 text-xs">Sin DELETEs en los últimos 7 días</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Tabla</th>
                    <th className="text-left px-3 py-2 font-semibold">ID reg.</th>
                    <th className="text-left px-3 py-2 font-semibold">Quién eliminó</th>
                    <th className="text-left px-3 py-2 font-semibold">IP</th>
                    <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.deletes_recientes_7d?.map((d: any, i: number) => (
                    <React.Fragment key={i}>
                      <tr className="border-t border-slate-50 hover:bg-red-50 cursor-pointer"
                        onClick={() => setExpandedDelete(expandedDelete === d.id ? null : d.id)}>
                        <td className="px-3 py-2 font-mono text-red-700">{d.tabla}</td>
                        <td className="px-3 py-2 text-slate-500">{d.registro_id}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-700">{d.usuario_nombre}</span>
                          <span className="ml-1 text-[10px] text-slate-400">#{d.usuario_id}</span>
                          {d.usuario_rol && <span className="ml-1 text-[10px] text-slate-400">· {d.usuario_rol}</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-400 font-mono">{d.ip_address || '—'}</td>
                        <td className="px-3 py-2 text-slate-400">{d.fecha ? new Date(d.fecha).toLocaleString('es-CO') : '—'}</td>
                        <td className="px-3 py-2">
                          <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition ${expandedDelete === d.id ? 'rotate-90' : ''}`} />
                        </td>
                      </tr>
                      {expandedDelete === d.id && d.datos_anteriores && (
                        <tr className="bg-red-50">
                          <td colSpan={6} className="px-4 py-3">
                            <p className="text-[11px] font-bold text-slate-500 mb-1">Datos eliminados</p>
                            <pre className="text-[10px] bg-white border border-red-200 rounded-lg p-2 overflow-auto max-h-40 text-slate-600">
                              {JSON.stringify(d.datos_anteriores, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Usuarios inactivos > 90 días */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">Usuarios activos sin actividad {'>'} 90 días</h3>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${data.usuarios_inactivos_90d?.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
              {data.usuarios_inactivos_90d?.length ?? 0}
            </span>
          </div>
          {data.usuarios_inactivos_90d?.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-400 text-xs">Todos los usuarios tienen actividad reciente</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                    <th className="text-left px-3 py-2 font-semibold">Username</th>
                    <th className="text-left px-3 py-2 font-semibold">Rol</th>
                    <th className="text-left px-3 py-2 font-semibold">Creado en</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usuarios_inactivos_90d?.map((u: any, i: number) => (
                    <tr key={u.id ?? i} className="border-t border-slate-50 hover:bg-amber-50">
                      <td className="px-3 py-2 font-semibold text-slate-700">{u.nombre_completo}</td>
                      <td className="px-3 py-2 text-slate-500">{u.username}</td>
                      <td className="px-3 py-2 text-slate-400">{u.rol}</td>
                      <td className="px-3 py-2 text-slate-400">{u.creado_en ? new Date(u.creado_en).toLocaleDateString('es-CO') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RootPage;
