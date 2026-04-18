import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Plus, Trash2, Search, PackagePlus } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface CatalogoItem {
  id: number;
  codigo: string;
  nombre: string;
}

interface FilaPerfil {
  uid: number;
  codigo: string;
  nombre: string;
  mm: string;
  ubicacion: string;
  query: string;
  showSuggestions: boolean;
}

interface Props {
  onClose: () => void;
  onGuardado: () => void;
}

let uidCounter = 0;
const newFila = (): FilaPerfil => ({
  uid: ++uidCounter,
  codigo: '', nombre: '', mm: '', ubicacion: '', query: '', showSuggestions: false,
});

const IngresarPerfilModal: React.FC<Props> = ({ onClose, onGuardado }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [filas, setFilas] = useState<FilaPerfil[]>([newFila()]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/catalogo`, { headers })
      .then(r => setCatalogo(r.data))
      .catch(() => toast.error('Error al cargar catálogo'));
  }, []);

  const getSuggestions = (query: string): CatalogoItem[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return catalogo.filter(c =>
      (c.codigo?.toLowerCase() ?? '').includes(q) || (c.nombre?.toLowerCase() ?? '').includes(q)
    ).slice(0, 8);
  };

  const updateFila = (uid: number, field: keyof FilaPerfil, value: any) => {
    setFilas(prev => prev.map(f => f.uid === uid ? { ...f, [field]: value } : f));
  };

  const handleQueryChange = (uid: number, value: string) => {
    setFilas(prev => prev.map(f => f.uid === uid
      ? { ...f, query: value, codigo: '', nombre: '', showSuggestions: true }
      : f
    ));
  };

  const seleccionarCatalogo = (uid: number, item: CatalogoItem) => {
    setFilas(prev => prev.map(f => f.uid === uid
      ? { ...f, codigo: item.codigo, nombre: item.nombre, query: `${item.codigo} — ${item.nombre}`, showSuggestions: false }
      : f
    ));
  };

  const eliminarFila = (uid: number) => {
    if (filas.length === 1) return;
    setFilas(prev => prev.filter(f => f.uid !== uid));
  };

  const handleGuardar = async () => {
    const validas = filas.filter(f => f.codigo && f.mm && Number(f.mm) > 0);
    if (validas.length === 0) {
      toast.error('Agrega al menos un perfil con código y longitud válida');
      return;
    }
    setGuardando(true);
    try {
      const items = validas.map(f => ({
        codigo: f.codigo,
        mm: Number(f.mm),
        ubicacion: f.ubicacion || null,
      }));
      const { data } = await axios.post(`${API}/api/inventario-perfileria/bulk`, { items }, { headers });
      toast.success(`${data.insertados} perfil${data.insertados !== 1 ? 'es' : ''} ingresado${data.insertados !== 1 ? 's' : ''} correctamente`);
      onGuardado();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col h-[95vh] border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Ingresar Perfilería</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabla de filas */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase w-[45%]">Código / Nombre *</th>
                <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase w-[18%] px-2">Longitud (mm) *</th>
                <th className="pb-2 text-left text-xs font-bold text-slate-500 uppercase w-[25%] px-2">Ubicación</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filas.map((fila, idx) => {
                const suggestions = getSuggestions(fila.query);
                return (
                  <tr key={fila.uid} className="group">
                    {/* Autocomplete */}
                    <td className="py-2 pr-2 relative">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={fila.query}
                          onChange={e => handleQueryChange(fila.uid, e.target.value)}
                          onFocus={() => updateFila(fila.uid, 'showSuggestions', true)}
                          onBlur={() => setTimeout(() => updateFila(fila.uid, 'showSuggestions', false), 150)}
                          placeholder="Buscar código o nombre..."
                          className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${fila.codigo ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}
                        />
                        {fila.showSuggestions && suggestions.length > 0 && (
                          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                            {suggestions.map(s => (
                              <button key={s.id} onMouseDown={() => seleccionarCatalogo(fila.uid, s)}
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0">
                                <span className="font-mono font-semibold text-indigo-700 text-xs">{s.codigo}</span>
                                <span className="text-slate-600 ml-2 text-xs">{s.nombre}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* mm */}
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={fila.mm}
                        onChange={e => updateFila(fila.uid, 'mm', e.target.value)}
                        placeholder="0"
                        min="1"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </td>

                    {/* Ubicación */}
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={fila.ubicacion}
                        onChange={e => updateFila(fila.uid, 'ubicacion', e.target.value)}
                        placeholder="Ej: P-01"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </td>

                    {/* Eliminar fila */}
                    <td className="py-2 text-center">
                      <button onClick={() => eliminarFila(fila.uid)}
                        disabled={filas.length === 1}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 disabled:opacity-20 disabled:cursor-not-allowed">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Agregar fila */}
          <button onClick={() => setFilas(prev => [...prev, newFila()])}
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-all">
            <Plus className="w-4 h-4" /> Agregar otro perfil
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {filas.filter(f => f.codigo && Number(f.mm) > 0).length} de {filas.length} fila{filas.length !== 1 ? 's' : ''} válida{filas.filter(f => f.codigo && Number(f.mm) > 0).length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={guardando}
              className="px-5 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-200 disabled:opacity-50 text-sm flex items-center gap-2">
              {guardando
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Guardando...</>
                : <><PackagePlus className="w-4 h-4" /> Guardar ingreso</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IngresarPerfilModal;
