import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, Database, Cloud, Activity, ClipboardList,
  HardDrive, Wrench, Bell, BookOpen, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Download,
  Upload, RotateCcw, Trash2, ChevronRight, Cpu,
  Wifi, WifiOff, Clock
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
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
  { id: 'resumen', label: 'Resumen', icon: Shield },
  { id: 'supabase', label: 'Base de Datos', icon: Database },
  { id: 'cloudinary', label: 'Almacenamiento', icon: Cloud },
  { id: 'servicios', label: 'Servicios', icon: Activity },
  { id: 'auditoria', label: 'Auditoría', icon: ClipboardList },
  { id: 'backup', label: 'Backup', icon: HardDrive },
  { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { id: 'alertas', label: 'Alertas', icon: Bell },
  { id: 'catalogo', label: 'Catálogo', icon: BookOpen },
];

// ─── RootPage ─────────────────────────────────────────────────────────────────
const RootPage: React.FC = () => {
  const [tab, setTab] = useState('resumen');

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
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition ${tab === t.id ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'resumen' && <TabResumen setTab={setTab} />}
        {tab === 'supabase' && <TabSupabase />}
        {tab === 'cloudinary' && <TabCloudinary />}
        {tab === 'servicios' && <TabServicios />}
        {tab === 'auditoria' && <TabAuditoria />}
        {tab === 'backup' && <TabBackup />}
        {tab === 'mantenimiento' && <TabMantenimiento />}
        {tab === 'alertas' && <TabAlertas />}
        {tab === 'catalogo' && <TabCatalogo />}
      </div>
    </div>
  );
};

// ─── Tab Resumen ──────────────────────────────────────────────────────────────
const TabResumen: React.FC<{ setTab: (t: string) => void }> = ({ setTab }) => {
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

  return (
    <div className="space-y-6">
      {/* Alertas activas */}
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
            {resultado && (
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

export default RootPage;
