import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { Search, MapPin, Ruler, Trash2, Edit2, Check, X, BarChart2, List, PackagePlus, Download, FileSpreadsheet } from 'lucide-react';
import IngresarPerfilModal from './IngresarPerfilModal';
import { getCatalogoCached } from '../../services/listasCache';

import API from '../../services/config';

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

type ViewMode = 'lista' | 'resumen' | 'reporte';

const InventarioPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth.user);
  const isAdmin = user?.rol === 'admin';

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

  const [reporteSearch, setReporteSearch] = useState('');

  // Edición inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ ubicacion: string; mm: string }>({ ubicacion: '', mm: '' });

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    getCatalogoCached()
      .then((data: CatalogoItem[]) => {
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

  const statsReporteFiltrados = stats.filter(s => {
    if (!reporteSearch) return true;
    const q = reporteSearch.toLowerCase();
    return s.codigo.toLowerCase().includes(q) || (catalogoMap[s.codigo] || '').toLowerCase().includes(q);
  });

  const handleExportReporte = () => {
    const filas: any[] = statsReporteFiltrados.map(s => ({
      'CÓDIGO': s.codigo,
      'DESCRIPCIÓN': catalogoMap[s.codigo] || '',
      'TOTAL PIEZAS': s.total_piezas,
      'TOTAL MM': s.total_mm,
      'TOTAL METROS': parseFloat((s.total_mm / 1000).toFixed(2)),
    }));
    filas.push({
      'CÓDIGO': 'TOTAL',
      'DESCRIPCIÓN': '',
      'TOTAL PIEZAS': statsReporteFiltrados.reduce((a, s) => a + s.total_piezas, 0),
      'TOTAL MM': statsReporteFiltrados.reduce((a, s) => a + s.total_mm, 0),
      'TOTAL METROS': parseFloat((statsReporteFiltrados.reduce((a, s) => a + s.total_mm, 0) / 1000).toFixed(2)),
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte MM Perfilería');
    const fecha = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `reporte_mm_perfileria_${fecha}.xlsx`);
  };

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

  const handleExport = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/inventario-perfileria/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const filas = data.map((row: any) => ({
        CONSECUTIVO: row.consecutivo,
        CÓDIGO: row.codigo,
        DESCRIPCIÓN: row.descripcion,
        'MM': row.mm,
        UBICACIÓN: row.ubicacion,
      }));

      const ws = XLSX.utils.json_to_sheet(filas);
      ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

      const fecha = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `inventario_perfileria_${fecha}.xlsx`);
    } catch {
      toast.error('Error al exportar el inventario');
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
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 transition-all"
          >
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
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
          {isAdmin && (
            <button
              onClick={() => setViewMode('reporte')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${viewMode === 'reporte' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-600 border-violet-300 hover:bg-violet-50'}`}
            >
              <FileSpreadsheet className="w-4 h-4" /> Reporte
            </button>
          )}
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
      ) : viewMode === 'reporte' ? (
        /* Vista reporte admin */
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar por código o descripción..."
                value={reporteSearch}
                onChange={e => setReporteSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <button
              onClick={handleExportReporte}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" /> Descargar Excel
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100 text-xs font-medium text-violet-700">
              Reporte de stock en MM por perfil — {statsReporteFiltrados.length} perfiles
              {reporteSearch && ` · filtro: "${reporteSearch}"`}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Código</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Descripción</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Piezas</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total MM</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Metros</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statsReporteFiltrados.map(s => (
                    <tr key={s.codigo} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{s.codigo}</td>
                      <td className="px-4 py-2.5 text-slate-500">{catalogoMap[s.codigo] || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{s.total_piezas.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{s.total_mm.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-violet-700">
                        {(s.total_mm / 1000).toFixed(2)} m
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-violet-50 border-t-2 border-violet-200 font-semibold">
                    <td className="px-4 py-3 text-violet-800">TOTAL</td>
                    <td />
                    <td className="px-4 py-3 text-right text-violet-800">
                      {statsReporteFiltrados.reduce((a, s) => a + s.total_piezas, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-violet-800">
                      {statsReporteFiltrados.reduce((a, s) => a + s.total_mm, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-violet-800">
                      {(statsReporteFiltrados.reduce((a, s) => a + s.total_mm, 0) / 1000).toFixed(2)} m
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
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
