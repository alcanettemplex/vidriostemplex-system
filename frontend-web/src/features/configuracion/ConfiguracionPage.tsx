import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Save, DollarSign, Clock, AlertCircle, TrendingUp, Users } from 'lucide-react';
import API from '../../services/config';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MetaUsuario {
  usuario_id: number;
  nombre_completo: string;
  rol: string;
  meta_facturacion: number;
}

// ─── Helpers visuales ─────────────────────────────────────────────────────────

const ROL_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  gerencia:         { label: 'Gerencia',         badge: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  asesor_comercial: { label: 'Asesor Comercial', badge: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500'   },
  jefe_produccion:  { label: 'Jefe Producción',  badge: 'bg-amber-100 text-amber-700 border-amber-200',    dot: 'bg-amber-500'  },
};

function avatarColor(rol: string) {
  const map: Record<string, string> = {
    gerencia:         'bg-purple-600',
    asesor_comercial: 'bg-blue-600',
    jefe_produccion:  'bg-amber-500',
  };
  return map[rol] ?? 'bg-slate-500';
}

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function formatCOP(val: number | string) {
  const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val;
  if (!num || isNaN(num)) return '';
  return new Intl.NumberFormat('es-CO').format(num);
}

function parseCOP(val: string): number {
  const raw = val.replace(/\D/g, '');
  return raw ? parseInt(raw, 10) : 0;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const ConfiguracionPage: React.FC = () => {
  const [config, setConfig]             = useState<any>(null);
  const [metaMensual, setMetaMensual]   = useState<any>(null);
  const [metasUsuarios, setMetasUsuarios] = useState<MetaUsuario[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [mensaje, setMensaje]           = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear]   = useState<number>(new Date().getFullYear());

  const token   = sessionStorage.getItem('token');

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [configRes, metaRes, usuariosRes] = await Promise.all([
        fetch(`${API}/api/configuracion`, { headers }),
        fetch(`${API}/api/configuracion/metas/${selectedYear}/${selectedMonth}`, { headers }),
        fetch(`${API}/api/configuracion/metas-usuarios/${selectedYear}/${selectedMonth}`, { headers }),
      ]);

      if (configRes.ok)    setConfig(await configRes.json());
      if (metaRes.ok)      setMetaMensual(await metaRes.json());
      if (usuariosRes.ok)  setMetasUsuarios(await usuariosRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, API, token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Total calculado dinámicamente ────────────────────────────────────────

  const totalGlobal = metasUsuarios.reduce((acc, u) => acc + (u.meta_facturacion || 0), 0);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setConfig({ ...config, [e.target.name]: raw ? Number(raw) : '' });
  };

  const handleMetaUsuario = (usuario_id: number, raw: string) => {
    const val = parseCOP(raw);
    setMetasUsuarios(prev =>
      prev.map(u => u.usuario_id === usuario_id ? { ...u, meta_facturacion: val } : u)
    );
  };

  // ─── Guardar ──────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMensaje(null);
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const [r1, r2, r3] = await Promise.all([
        fetch(`${API}/api/configuracion`, {
          method: 'PUT', headers,
          body: JSON.stringify(config)
        }),
        fetch(`${API}/api/configuracion/metas/${selectedYear}/${selectedMonth}`, {
          method: 'PUT', headers,
          body: JSON.stringify(metaMensual)
        }),
        fetch(`${API}/api/configuracion/metas-usuarios/${selectedYear}/${selectedMonth}`, {
          method: 'PUT', headers,
          body: JSON.stringify(metasUsuarios.map(u => ({
            usuario_id: u.usuario_id,
            meta_facturacion: u.meta_facturacion
          })))
        }),
      ]);

      if (r1.ok && r2.ok && r3.ok) {
        setMensaje({ tipo: 'exito', texto: 'Configuración guardada exitosamente.' });
      } else {
        setMensaje({ tipo: 'error', texto: 'Error al guardar. Verifica los datos.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMensaje(null), 3500);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const nombreMes = new Date(0, selectedMonth - 1).toLocaleString('es', { month: 'long' });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-3">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <Settings className="w-8 h-8 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Configuración de Inteligencia y Metas</h1>
          <p className="text-sm font-semibold text-slate-500">Ajusta los parámetros operativos y metas financieras por periodo temporal.</p>
        </div>
      </motion.div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* ── METAS FINANCIERAS ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

          {/* Cabecera con selector de periodo */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              Metas Financieras Variables
            </h2>
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 transition"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('es', { month: 'long' }).toUpperCase()}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 transition"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-indigo-500">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <span className="text-sm font-semibold">Cargando metas del periodo...</span>
              </div>
            </div>
          ) : (
            <>
              {/* ── Total global ──────────────────────────────────────────── */}
              <div className="px-6 pt-5 pb-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Meta Global de Facturación — {nombreMes} {selectedYear}
                </p>
                <motion.div
                  key={totalGlobal}
                  initial={{ scale: 0.97 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-6 py-4"
                >
                  <div className="p-2 bg-emerald-100 rounded-xl">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Total suma de asesores</p>
                    <p className="text-3xl font-black text-emerald-700 font-mono tracking-tight">
                      ${totalGlobal > 0 ? formatCOP(totalGlobal) : '0'}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[11px] text-slate-400 font-semibold">
                      {metasUsuarios.filter(u => u.meta_facturacion > 0).length} / {metasUsuarios.length} usuarios
                    </p>
                    <p className="text-[11px] text-slate-400">con meta asignada</p>
                  </div>
                </motion.div>
              </div>

              {/* ── Tabla de metas individuales ───────────────────────────── */}
              <div className="px-6 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-600">Meta individual por usuario</p>
                </div>

                {metasUsuarios.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm font-semibold">
                    No hay usuarios activos con rol asesor, jefe de producción o gerencia.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {metasUsuarios.map((u, idx) => {
                        const rolCfg  = ROL_CONFIG[u.rol] ?? { label: u.rol, badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
                        const pct     = totalGlobal > 0 ? Math.round((u.meta_facturacion / totalGlobal) * 100) : 0;

                        return (
                          <motion.div
                            key={u.usuario_id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className="group flex items-center gap-4 bg-slate-50 hover:bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm rounded-xl px-4 py-3 transition-all"
                          >
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-full ${avatarColor(u.rol)} flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm`}>
                              {initials(u.nombre_completo)}
                            </div>

                            {/* Nombre y rol */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate leading-tight">{u.nombre_completo}</p>
                              <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${rolCfg.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${rolCfg.dot}`} />
                                {rolCfg.label}
                              </span>
                            </div>

                            {/* Input meta */}
                            <div className="flex flex-col items-end gap-1 w-44 flex-shrink-0">
                              <div className="relative w-full">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pointer-events-none">$</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatCOP(u.meta_facturacion)}
                                  onChange={e => handleMetaUsuario(u.usuario_id, e.target.value)}
                                  placeholder="0"
                                  className="w-full bg-white border border-slate-200 group-hover:border-emerald-300 focus:border-emerald-400 rounded-lg pl-7 pr-3 py-2 text-sm font-mono font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-emerald-100 transition"
                                />
                              </div>
                              {/* Barra de porcentaje */}
                              <div className="w-full flex items-center gap-2">
                                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div
                                    className="h-full bg-emerald-400 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.3 }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 w-7 text-right">{pct}%</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>

            </>
          )}
        </section>

        {/* ── RENDIMIENTO Y TALLER ──────────────────────────────────────────── */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Rendimiento y Taller (Global)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ciclo Promedio de Producción Meta (Días)</label>
              <input
                type="text" inputMode="numeric" name="meta_ciclo_produccion_dias"
                value={formatCOP(config?.meta_ciclo_produccion_dias ?? '')}
                onChange={handleConfigChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-300 outline-none transition"
              />
              <p className="text-xs text-slate-400 mt-1">Límite para marcar el ciclo de taller como rápido o lento.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Alerta: ODP Inactiva/Estancada (Días)</label>
              <input
                type="text" inputMode="numeric" name="dias_alerta_odp_estancada"
                value={formatCOP(config?.dias_alerta_odp_estancada ?? '')}
                onChange={handleConfigChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-300 outline-none transition"
              />
            </div>
          </div>
        </section>

        {/* ── FLUJO DE CAJA ─────────────────────────────────────────────────── */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" /> Flujo de Caja y Cartera (Global)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Alerta: Cartera Vencida Crítica (Días atraso)</label>
              <input
                type="text" inputMode="numeric" name="dias_alerta_cartera_vencida"
                value={formatCOP(config?.dias_alerta_cartera_vencida ?? '')}
                onChange={handleConfigChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-300 outline-none transition"
              />
            </div>
          </div>
        </section>

        {/* ── BOTÓN GUARDAR ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-8 py-3 rounded-xl font-extrabold shadow-sm transition-all focus:ring-4 focus:ring-indigo-100 disabled:opacity-50"
          >
            {saving
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Guardando...</>
              : <><Save className="w-5 h-5" /> Guardar Cambios</>
            }
          </button>

          <AnimatePresence>
            {mensaje && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`font-bold text-sm ${mensaje.tipo === 'exito' ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {mensaje.tipo === 'exito' ? '✓ ' : '✕ '}{mensaje.texto}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

      </form>
    </div>
  );
};

export default ConfiguracionPage;
