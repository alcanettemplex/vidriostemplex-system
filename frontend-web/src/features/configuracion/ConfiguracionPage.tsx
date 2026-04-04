import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, DollarSign, Clock, AlertCircle } from 'lucide-react';

export const ConfiguracionPage: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [metaMensual, setMetaMensual] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const fetchConfigData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const configRes = await fetch(`${API_URL}/api/configuracion`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (configRes.ok) setConfig(await configRes.json());

      const metaRes = await fetch(`${API_URL}/api/configuracion/metas/${selectedYear}/${selectedMonth}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (metaRes.ok) setMetaMensual(await metaRes.json());

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigData();
  }, [selectedMonth, selectedYear]);

  const formatMonto = (val: any) => {
    if (val === null || val === undefined || val === '') return '';
    const num = parseInt(String(val).replace(/\D/g, ''), 10);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('es-CO').format(num);
  };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isNumeric = e.target.dataset.type === 'number';
    let val: any = e.target.value;
    if (isNumeric) {
      const raw = val.replace(/\D/g, '');
      val = raw ? Number(raw) : '';
    }
    setConfig({ ...config, [e.target.name]: val });
  };

  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isNumeric = e.target.dataset.type === 'number';
    let val: any = e.target.value;
    if (isNumeric) {
      const raw = val.replace(/\D/g, '');
      val = raw ? Number(raw) : '';
    }
    setMetaMensual({ ...metaMensual, [e.target.name]: val });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMensaje(null);
    try {
      const token = localStorage.getItem('token');

      const resConfig = await fetch(`${API_URL}/api/configuracion`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(config)
      });

      const resMeta = await fetch(`${API_URL}/api/configuracion/metas/${selectedYear}/${selectedMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(metaMensual)
      });

      if (resConfig.ok && resMeta.ok) {
        setMensaje({ tipo: 'exito', texto: 'Configuración y metas guardadas exitosamente.' });
      } else {
        setMensaje({ tipo: 'error', texto: 'Error parcial o total al guardar la configuración.' });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'Error de red.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMensaje(null), 3000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
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

        {/* Metas Financieras por Mes */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" /> Metas Financieras Variables
            </h2>
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="bg-white border border-slate-300 text-sm rounded-md px-3 py-1 font-bold text-slate-700 outline-none">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('es', { month: 'long' }).toUpperCase()}</option>
                ))}
              </select>
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-white border border-slate-300 text-sm rounded-md px-3 py-1 font-bold text-slate-700 outline-none">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="h-20 flex items-center justify-center animate-pulse text-indigo-500 font-bold">Cargando metas del periodo...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Meta de Facturación Mensual Global ($)</label>
                <input type="text" inputMode="numeric" data-type="number" name="meta_facturacion" value={formatMonto(metaMensual?.meta_facturacion)} onChange={handleMetaChange} className="w-full bg-slate-50 border border-emerald-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition" />
                <p className="text-xs text-slate-500 mt-1">Este valor alimenta las gráficas exclusivamente para el mes de {new Date(0, selectedMonth - 1).toLocaleString('es', { month: 'long' })} {selectedYear}.</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Meta: ODPs Cerradas por Asesor</label>
                <input type="text" inputMode="numeric" data-type="number" name="meta_odps_asesor" value={formatMonto(metaMensual?.meta_odps_asesor)} onChange={handleMetaChange} className="w-full bg-slate-50 border border-emerald-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition" />
              </div>
            </div>
          )}
        </section>

        {/* Parámetros Operativos */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Rendimiento y Taller (Global)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ciclo Promedio de Producción Meta (Días)</label>
              <input type="text" inputMode="numeric" data-type="number" name="meta_ciclo_produccion_dias" value={formatMonto(config?.meta_ciclo_produccion_dias)} onChange={handleConfigChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition" />
              <p className="text-xs text-slate-500 mt-1">Límite para marcar el ciclo de taller como rápido o lento.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Alerta: ODP Inactiva/Estancada (Días)</label>
              <input type="text" inputMode="numeric" data-type="number" name="dias_alerta_odp_estancada" value={formatMonto(config?.dias_alerta_odp_estancada)} onChange={handleConfigChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition" />
            </div>
          </div>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" /> Flujo de Caja y Cartera (Global)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Alerta: Cartera Vencida Crítica (Días atraso)</label>
              <input type="text" inputMode="numeric" data-type="number" name="dias_alerta_cartera_vencida" value={formatMonto(config?.dias_alerta_cartera_vencida)} onChange={handleConfigChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-mono font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition" />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-extrabold shadow-sm transition-all focus:ring-4 focus:ring-indigo-100 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : <><Save className="w-5 h-5" /> Guardar Cambios</>}
          </button>

          {mensaje && (
            <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`font-bold text-sm ${mensaje.tipo === 'exito' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {mensaje.texto}
            </motion.span>
          )}
        </div>

      </form>
    </div>
  );
};

export default ConfiguracionPage;
