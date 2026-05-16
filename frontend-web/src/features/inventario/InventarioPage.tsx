import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Search, MapPin, Ruler, Trash2, Edit2, Check, X, BarChart2, List, PackagePlus } from 'lucide-react';
import IngresarPerfilModal from './IngresarPerfilModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface PerfilItem {
  id: number;
  consecutivo: number;
  codigo: string;
  mm: number;
  ubicacion: string | null;
  fecha_corte: string;
}

interface StatItem {
  codigo: string;
  total_piezas: number;
  total_mm: number;
  ubicaciones: string;
}

interface CatalogoItem {
  id: number;
  codigo: string;
  nombre: string;
}

type ViewMode = 'lista' | 'resumen';

const InventarioPage: React.FC = () => {
  const [items, setItems] = useState<PerfilItem[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [catalogoMap, setCatalogoMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [search, setSearch] = useState('');
  const [filterUbicacion, setFilterUbicacion] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 200;

  const [ultimaEntrada, setUltimaEntrada] = useState<string | null>(null);
  const [showIngresoModal, setShowIngresoModal] = useState(false);

  // Edición inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ ubicacion: string; mm: string }>({ ubicacion: '', mm: '' });

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get<CatalogoItem[]>(`${API}/api/catalogo`, { headers })
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data.forEach(c => { map[c.codigo] = c.nombre; });
        setCatalogoMap(map);
      })
      .catch(() => {});
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: LIMIT };
      if (search) params.search = search;
      if (filterUbicacion) params.ubicacion = filterUbicacion;
      const { data } = await axios.get(`${API}/api/inventario-perfileria`, { headers, params });
      setItems(data.items);
      setTotal(data.total);
      if (data.ultima_entrada) setUltimaEntrada(data.ultima_entrada);
    } catch {
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  }, [search, filterUbicacion, page]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/inventario-perfileria/stats`, { headers });
      setStats(data);
    } catch {
      toast.error('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'lista') loadItems();
    else loadStats();
  }, [viewMode, loadItems, loadStats]);

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => {
      if (viewMode === 'lista') {
        setPage(1);
        loadItems();
      }
    }, 400);
    return () => clearTimeout(t);
  }, [search, filterUbicacion]);

  const startEdit = (item: PerfilItem) => {
    setEditingId(item.id);
    setEditValues({ ubicacion: item.ubicacion || '', mm: String(item.mm) });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: number) => {
    try {
      await axios.patch(`${API}/api/inventario-perfileria/${id}`, {
        ubicacion: editValues.ubicacion || null,
        mm: parseFloat(editValues.mm),
      }, { headers });
      setEditingId(null);
      loadItems();
      toast.success('Perfil actualizado');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: number, consecutivo: number) => {
    if (!window.confirm(`¿Eliminar perfil #${consecutivo}? Esta acción no se puede deshacer.`)) return;
    try {
      await axios.delete(`${API}/api/inventario-perfileria/${id}`, { headers });
      loadItems();
      toast.success('Perfil eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // Obtener ubicaciones únicas para filtro
  const ubicacionesUnicas = Array.from(new Set(items.map(i => i.ubicacion).filter(Boolean))).sort();

  const formatMm = (mm: number) => {
    const rounded = Math.round(mm);
    if (rounded >= 6000) return <span className="font-semibold text-emerald-700">{rounded.toLocaleString()} mm (barra completa)</span>;
    if (rounded >= 3000) return <span className="text-blue-700">{rounded.toLocaleString()} mm</span>;
    return <span className="text-slate-600">{rounded.toLocaleString()} mm</span>;
  };

  return (
    <>
    <div className="p-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario Perfilería</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ultimaEntrada
              ? `Último ingreso: ${new Date(ultimaEntrada).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Sin ingresos registrados'
            } — {total.toLocaleString()} piezas registradas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowIngresoModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200"
          >
            <PackagePlus className="w-4 h-4" /> Ingresar Perfilería
          </button>
          <button
            onClick={() => setViewMode('lista')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${viewMode === 'lista' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <List className="w-4 h-4" /> Lista
          </button>
          <button
            onClick={() => setViewMode('resumen')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${viewMode === 'resumen' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <BarChart2 className="w-4 h-4" /> Por código
          </button>
        </div>
      </div>

      {/* Filtros (solo en vista lista) */}
      {viewMode === 'lista' && (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar #, código o ubicación..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterUbicacion}
              onChange={e => { setFilterUbicacion(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white appearance-none cursor-pointer"
            >
              <option value="">Todas las ubicaciones</option>
              {ubicacionesUnicas.map(u => (
                <option key={u} value={u!}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : viewMode === 'lista' ? (
        <>
          {/* Tabla lista */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 w-20">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Longitud</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Ubicación</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{item.consecutivo}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{item.codigo || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-sm">{catalogoMap[item.codigo] || '—'}</td>
                      <td className="px-4 py-2.5">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-1">
                            <Ruler className="w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="number"
                              value={editValues.mm}
                              onChange={e => setEditValues(v => ({ ...v, mm: e.target.value }))}
                              className="w-24 border border-indigo-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                            <span className="text-slate-400 text-xs">mm</span>
                          </div>
                        ) : (
                          formatMm(item.mm)
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={editValues.ubicacion}
                            onChange={e => setEditValues(v => ({ ...v, ubicacion: e.target.value }))}
                            placeholder="Ej: P-01"
                            className="w-28 border border-indigo-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${item.ubicacion ? 'bg-slate-100 text-slate-700' : 'text-slate-400 italic'}`}>
                            {item.ubicacion ? <><MapPin className="w-3 h-3" />{item.ubicacion}</> : 'Sin ubicación'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {editingId === item.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => saveEdit(item.id)} className="p-1 rounded hover:bg-emerald-100 text-emerald-600">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEdit} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(item)} className="p-1 rounded hover:bg-indigo-100 text-indigo-500">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item.id, item.consecutivo)} className="p-1 rounded hover:bg-red-100 text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          {total > LIMIT && (
            <div className="flex justify-center gap-3 mt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-slate-50"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-slate-600">
                Pág. {page} de {Math.ceil(total / LIMIT)}
              </span>
              <button
                disabled={page * LIMIT >= total}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-slate-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      ) : (
        /* Vista resumen por código */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Código</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Piezas</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total mm</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total metros</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Ubicaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.map(s => (
                  <tr key={s.codigo} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{s.codigo}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-sm">{catalogoMap[s.codigo] || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{s.total_piezas}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{s.total_mm.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">
                      {(s.total_mm / 1000).toFixed(2)} m
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{s.ubicaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-4 py-3 text-slate-700">TOTAL</td>
                  <td />
                  <td className="px-4 py-3 text-right text-slate-700">
                    {stats.reduce((a, s) => a + s.total_piezas, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {stats.reduce((a, s) => a + s.total_mm, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-indigo-700">
                    {(stats.reduce((a, s) => a + s.total_mm, 0) / 1000).toFixed(2)} m
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>

    {showIngresoModal && (
      <IngresarPerfilModal
        onClose={() => setShowIngresoModal(false)}
        onGuardado={() => {
          setShowIngresoModal(false);
          loadItems();
        }}
      />
    )}
    </>
  );
};

export default InventarioPage;
