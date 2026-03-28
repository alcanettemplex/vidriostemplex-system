import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Save, AlertCircle, DollarSign, Clock, Users, BookOpen, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

type CatItem = { id: number; categoria: string; nombre: string; descripcion: string; activo: boolean };

export const ConfiguracionPage: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [metaMensual, setMetaMensual] = useState<any>(null);

  // Catálogo de productos
  const [catalogo, setCatalogo] = useState<CatItem[]>([]);
  const [catTab, setCatTab] = useState<string>('');
  const [catForm, setCatForm] = useState<Partial<CatItem> | null>(null);
  const [catEditing, setCatEditing] = useState<number | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  
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

  const fetchCatalogo = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/catalogo/all`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data: CatItem[] = await res.json();
      setCatalogo(data);
      if (!catTab && data.length > 0) setCatTab(data[0].categoria);
    }
  };

  useEffect(() => { fetchCatalogo(); }, []);

  const catCategorias = Array.from(new Set(catalogo.map(i => i.categoria)));

  const saveCatItem = async () => {
    if (!catForm?.categoria || !catForm?.nombre) return;
    setCatSaving(true);
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    if (catEditing) {
      await fetch(`${API_URL}/api/catalogo/${catEditing}`, { method: 'PUT', headers, body: JSON.stringify(catForm) });
    } else {
      await fetch(`${API_URL}/api/catalogo`, { method: 'POST', headers, body: JSON.stringify(catForm) });
    }
    setCatForm(null);
    setCatEditing(null);
    setCatSaving(false);
    fetchCatalogo();
  };

  const deleteCatItem = async (id: number) => {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/catalogo/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchCatalogo();
  };

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
            {saving ? 'Guardando...' : <><Save className="w-5 h-5"/> Guardar Cambios</>}
          </button>
          
          {mensaje && (
            <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`font-bold text-sm ${mensaje.tipo === 'exito' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {mensaje.texto}
            </motion.span>
          )}
        </div>

      </form>

      {/* ─── CATÁLOGO DE PRODUCTOS ─────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl"><BookOpen className="w-6 h-6 text-emerald-600" /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Catálogo de Productos</h2>
              <p className="text-sm text-slate-500">Productos y servicios disponibles en el formulario de ODP</p>
            </div>
          </div>
          <button
            onClick={() => { setCatForm({ categoria: catTab || catCategorias[0] || '', nombre: '', descripcion: '', activo: true }); setCatEditing(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition"
          >
            <Plus className="w-4 h-4" /> Nuevo Producto
          </button>
        </div>

        {/* Tabs de categorías */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 mb-4">
          {catCategorias.map(cat => (
            <button key={cat} onClick={() => setCatTab(cat)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${catTab === cat ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Lista de ítems de la categoría activa */}
        <div className="space-y-2">
          {catalogo.filter(i => i.categoria === catTab).map(item => (
            <div key={item.id} className={`flex items-start gap-3 p-3 bg-white border rounded-xl ${!item.activo ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-800">{item.nombre}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.descripcion}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => { setCatForm(item); setCatEditing(item.id); }}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteCatItem(item.id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {catalogo.filter(i => i.categoria === catTab).length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No hay productos en esta categoría</p>
          )}
        </div>

        {/* Modal formulario catálogo */}
        {catForm !== null && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800">{catEditing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
                <button onClick={() => { setCatForm(null); setCatEditing(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría *</label>
                  <input
                    list="cat-list"
                    value={catForm.categoria || ''}
                    onChange={e => setCatForm(f => ({ ...f, categoria: e.target.value }))}
                    placeholder="Ej: Tableros, Espejos..."
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400"
                  />
                  <datalist id="cat-list">{catCategorias.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                  <input
                    value={catForm.nombre || ''}
                    onChange={e => setCatForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: VIDRIO TEMPLADO 6MM"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                  <textarea
                    value={catForm.descripcion || ''}
                    onChange={e => setCatForm(f => ({ ...f, descripcion: e.target.value }))}
                    rows={4}
                    placeholder="Descripción detallada del producto..."
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 resize-none"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={catForm.activo ?? true} onChange={e => setCatForm(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />
                  <span className="text-sm text-slate-700 font-medium">Activo (visible en formulario ODP)</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setCatForm(null); setCatEditing(null); }} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button onClick={saveCatItem} disabled={catSaving} className="px-4 py-2 text-sm bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 flex items-center gap-2">
                  <Check className="w-4 h-4" /> {catSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ConfiguracionPage;
