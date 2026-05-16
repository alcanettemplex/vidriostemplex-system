import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, ShoppingCart, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export interface SAPItemConContexto {
  id: number;
  item: string;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  und?: string;
  exist_perf?: string;
  observacion?: string;
  estado_compra: 'pendiente' | 'en_odc' | 'en_existencia';
  modificado?: boolean;
  datos_anteriores?: { codigo?: string; descripcion?: string; dimension?: string; cantidad?: number; und?: string; observacion?: string } | null;
  SAP: {
    id: number;
    numero_sap: string;
    ODP: {
      id: number;
      numero_odp: string;
      descripcion: string;
      cliente: { id: number; nombre_razon_social: string };
      asesor: { id: number; nombre_completo: string };
    };
  };
}

interface InventarioPerfil {
  id: number;
  consecutivo: number;
  codigo: string;
  mm: number | null;
  ubicacion: string | null;
}

interface Props {
  items: SAPItemConContexto[];
  onClose: () => void;
  onRefresh: () => void;
}

const ODCModal: React.FC<Props> = ({ items, onClose, onRefresh }) => {
  const [numeroOdc, setNumeroOdc] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  // Copia local editable de los items (para CANT. y UND editables)
  const [localItems, setLocalItems] = useState<SAPItemConContexto[]>(() =>
    items.map(i => ({ ...i }))
  );

  const updateLocalItem = (id: number, field: 'cantidad' | 'und', value: string) => {
    setLocalItems(prev => prev.map(it =>
      it.id !== id ? it : {
        ...it,
        [field]: field === 'cantidad' ? (parseFloat(value) || 0) : value,
      }
    ));
  };

  // Inventario perfilería por código
  const [inventarioPorCodigo, setInventarioPorCodigo] = useState<Record<string, InventarioPerfil[]>>({});
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [codigosPerfileria, setCodigosPerfileria] = useState<Set<string>>(new Set());
  // Perfiles seleccionados localmente — se aplican en BD solo al confirmar la ODC
  const [perfilesSeleccionados, setPerfilesSeleccionados] = useState<Record<number, InventarioPerfil[]>>({});

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/compras/codigos-perfileria`, { headers })
      .then(r => setCodigosPerfileria(new Set(r.data as string[])))
      .catch(err => console.error('Error cargando códigos perfilería:', err));

    const codigos = Array.from(new Set(items.map(i => i.codigo).filter(Boolean)));
    if (codigos.length === 0) return;

    setLoadingInventario(true);
    Promise.all(
      codigos.map(cod =>
        axios.get(`${API}/api/compras/inventario-perfileria/${encodeURIComponent(cod)}`, { headers })
          .then(r => ({ cod, data: r.data as InventarioPerfil[] }))
          .catch(() => ({ cod, data: [] as InventarioPerfil[] }))
      )
    ).then(results => {
      const map: Record<string, InventarioPerfil[]> = {};
      results.forEach(({ cod, data }) => { map[cod] = data; });
      setInventarioPorCodigo(map);
    }).finally(() => setLoadingInventario(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSeleccionarPerfil = (itemId: number, codigo: string, perfil: InventarioPerfil) => {
    setPerfilesSeleccionados(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), perfil],
    }));
    // Ocultar de todos los dropdowns para evitar selección doble
    setInventarioPorCodigo(prev => ({
      ...prev,
      [codigo]: (prev[codigo] || []).filter(p => p.consecutivo !== perfil.consecutivo),
    }));
  };

  const handleQuitarPerfil = (itemId: number, codigo: string, perfil: InventarioPerfil) => {
    setPerfilesSeleccionados(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter(p => p.consecutivo !== perfil.consecutivo),
    }));
    // Devolver al pool de opciones disponibles
    setInventarioPorCodigo(prev => ({
      ...prev,
      [codigo]: [...(prev[codigo] || []), perfil].sort((a, b) => a.consecutivo - b.consecutivo),
    }));
  };

  const renderExisPerf = (item: SAPItemConContexto) => {
    if (!item.codigo || !codigosPerfileria.has(item.codigo)) return <span className="text-slate-400">—</span>;
    const opciones = inventarioPorCodigo[item.codigo] ?? null;
    if (loadingInventario && opciones === null) return <span className="text-slate-400 text-[10px]">…</span>;

    const seleccionados = perfilesSeleccionados[item.id] || [];
    const opcionesDisponibles = opciones || [];

    if (seleccionados.length === 0 && opcionesDisponibles.length === 0) return <span className="text-slate-400">—</span>;

    return (
      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
        {seleccionados.map(p => (
          <div key={p.consecutivo} className="flex items-center gap-1 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
            <span className="text-[10px] font-bold text-green-700 flex-1 leading-tight">
              {p.mm != null ? `${Math.round(p.mm)} mm` : '—'} · #{p.consecutivo}
            </span>
            <button
              type="button"
              onClick={() => handleQuitarPerfil(item.id, item.codigo, p)}
              className="text-red-400 hover:text-red-600 font-bold text-[11px] leading-none shrink-0"
            >×</button>
          </div>
        ))}
        {opcionesDisponibles.length > 0 && (
          <select
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 w-full max-w-[150px] bg-white cursor-pointer mt-0.5"
            value=""
            onChange={e => {
              if (!e.target.value) return;
              const perfil = opcionesDisponibles.find(p => p.consecutivo === parseInt(e.target.value));
              if (perfil) handleSeleccionarPerfil(item.id, item.codigo, perfil);
            }}
          >
            <option value="">{seleccionados.length > 0 ? '+ Agregar…' : 'Seleccionar…'}</option>
            {opcionesDisponibles.map(p => (
              <option key={p.consecutivo} value={p.consecutivo}>
                {p.mm != null ? `${Math.round(p.mm)} mm` : '—'} — #{p.consecutivo} ({p.ubicacion || '—'})
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  // Agrupar items por código para la vista consolidada
  const gruposPorCodigo = (() => {
    const map = new Map<string, SAPItemConContexto[]>();
    for (const item of localItems) {
      const key = item.codigo || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  })();

  const handleCrearODC = async () => {
    if (!numeroOdc.trim() || !/^\d+$/.test(numeroOdc.trim())) { toast.error('El número de ODC es requerido (solo dígitos)'); return; }
    if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    setLoading(true);
    try {
      // 1. Crear la ODC en el backend
      await axios.post(`${API}/api/compras/odc`, {
        numero_odc: numeroOdc.trim(),
        proveedor,
        notas: notas || null,
        items: localItems.map(i => ({
          sap_item_id: i.id,
          item: i.item,
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
        })),
      }, { headers });

      // 2. Al confirmar la ODC: consumir del inventario y actualizar exist_perf en cada SAP item
      const entradasPerfil = Object.entries(perfilesSeleccionados) as [string, InventarioPerfil[]][];
      await Promise.allSettled(
        entradasPerfil.flatMap(([itemIdStr, perfiles]) => {
          if (!perfiles || perfiles.length === 0) return [];
          const itemId = Number(itemIdStr);
          const existPerfTexto = perfiles
            .map(p => `${p.mm != null ? `${Math.round(p.mm)} mm` : 'sin mm'} — #${p.consecutivo} (${p.ubicacion || '—'})`)
            .join(' / ');
          return [
            // Eliminar cada pieza seleccionada del inventario
            ...perfiles.map(p => axios.delete(`${API}/api/compras/inventario-perfileria/${p.consecutivo}`, { headers })),
            // Guardar texto descriptivo concatenado en el SAP item
            axios.patch(`${API}/api/compras/sap-item/${itemId}/exist-perf`, { exist_perf: existPerfTexto }, { headers }),
          ];
        })
      );

      toast.success('ODC creada exitosamente');
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al crear ODC');
    } finally { setLoading(false); }
  };

  // Calcular cantidad total por código (para la vista consolidada)
  const totalPorCodigo = (grupo: SAPItemConContexto[]) =>
    grupo.reduce((sum, it) => sum + Number(it.cantidad), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nueva ODC Consolidada</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {items.length} item(s) de {new Set(items.map(i => i.SAP?.id)).size} SAP(s) seleccionados
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Resumen de items agrupados por código */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Items seleccionados — agrupados por código
            </p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {Array.from(gruposPorCodigo.entries()).map(([codigo, grupo], gi) => (
                <div key={codigo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                  {/* Encabezado del grupo */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="font-mono font-black text-indigo-700 text-sm">{codigo}</span>
                    <span className="text-xs text-slate-500">—</span>
                    <span className="text-xs text-slate-600 font-medium flex-1 truncate">{grupo[0].descripcion || '—'}</span>
                    <span className="text-xs font-black text-indigo-700 shrink-0">
                      Total: {totalPorCodigo(grupo)} {grupo[0].und || ''}
                    </span>
                    {grupo.length > 1 && (
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
                        {grupo.length} SAPs
                      </span>
                    )}
                  </div>
                  {/* Filas de detalle por SAP de origen */}
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-1.5 text-left w-28">DIMENSIÓN</th>
                        <th className="px-4 py-1.5 text-center w-16">CANT.</th>
                        <th className="px-4 py-1.5 text-left w-28">UND</th>
                        <th className="px-4 py-1.5 text-left w-36">OBSERV.</th>
                        <th className="px-4 py-1.5 text-left w-28">SAP</th>
                        <th className="px-4 py-1.5 text-left w-28">ODP</th>
                        <th className="px-4 py-1.5 text-left">CLIENTE</th>
                        <th className="px-4 py-1.5 text-center w-40">EXIS. PERF.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {grupo.map((item, i) => (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="px-4 py-1.5 text-slate-600">{item.dimension || '—'}</td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={item.cantidad}
                              onChange={e => updateLocalItem(item.id, 'cantidad', e.target.value)}
                              className="w-16 text-center font-bold text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={item.und || ''}
                              onChange={e => updateLocalItem(item.id, 'und', e.target.value)}
                              placeholder="UND"
                              maxLength={10}
                              className="w-16 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 uppercase"
                            />
                          </td>
                          <td className="px-4 py-1.5 text-slate-400 text-[10px] truncate max-w-[140px]" title={item.observacion || ''}>{item.observacion || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-indigo-600">{item.SAP?.numero_sap || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-slate-700">{item.SAP?.ODP?.numero_odp || '—'}</td>
                          <td className="px-4 py-1.5 text-slate-600 truncate max-w-[180px]">{item.SAP?.ODP?.cliente?.nombre_razon_social || '—'}</td>
                          <td className="px-4 py-1.5 text-center">{renderExisPerf(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Campos de la ODC */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                N° ODC <span className="text-red-400">*</span>
              </label>
              <input
                value={numeroOdc}
                onChange={e => setNumeroOdc(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 12345"
                maxLength={20}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                Proveedor <span className="text-red-400">*</span>
              </label>
              <input
                value={proveedor}
                onChange={e => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor..."
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                Notas (opcional)
              </label>
              <input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones..."
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCrearODC}
            disabled={loading || !proveedor.trim() || !numeroOdc.trim()}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
          >
            {loading ? 'Creando...' : `Crear ODC con ${items.length} item(s)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ODCModal;
