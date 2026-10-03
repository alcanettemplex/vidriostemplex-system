import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Plus, Trash2, Search, PackagePlus, AlertCircle, Hash } from '../../components/ui/icons';
import { getCatalogoCached } from '../../services/listasCache';

import API from '../../services/config';

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
  /** Sugerencia resaltada con las flechas. -1 = ninguna. */
  indiceActivo: number;
  /** Quedó texto escrito que no correspondía a ningún producto del catálogo. */
  error: boolean;
  /** Solo en modo `conConsecutivo`: número que asigna el usuario. */
  consecutivo: string;
  /** Advertencia del consecutivo: ocupado en inventario o rechazado al guardar. */
  aviso: string | null;
}

interface Props {
  onClose: () => void;
  onGuardado: () => void;
  /**
   * Ingreso con consecutivo asignado por el usuario (2026-10-03). Sin esta bandera el
   * sistema numera solo (MAX + 1), como siempre.
   */
  conConsecutivo?: boolean;
  /** Se llama cuando un lote con consecutivo se guardó solo en parte: refresca sin cerrar. */
  onIngresoParcial?: () => void;
}

interface ResultadoVerificacion {
  ocupados: { consecutivo: number; motivo: string }[];
  ultimo_consecutivo: number;
}

/** Entero positivo o null: "12.5", "-3" o "" no son consecutivos válidos. */
const leerConsecutivo = (valor: string): number | null => {
  if (!/^\d+$/.test(valor.trim())) return null;
  const n = Number(valor);
  return n > 0 ? n : null;
};

/**
 * Tope de sugerencias visibles. Antes eran 8 y el corte era silencioso: buscar
 * "190" devuelve 11 productos activos, así que TRA0608 (8025 TRASLAPE 190 NEGRO)
 * caía en la posición 10 y parecía no existir. El desplegable conserva su alto
 * de siempre (max-h-72 ≈ 8 filas); el resto se alcanza con scroll o flechas.
 *
 * El orden sigue siendo el alfabético que entrega el backend, así que "190"
 * lista primero los sillares "2190" — ver TECH_DEBT.md 2026-09-21.
 */
const MAX_SUGERENCIAS = 50;

let uidCounter = 0;
const newFila = (consecutivo = ''): FilaPerfil => ({
  uid: ++uidCounter,
  codigo: '', nombre: '', mm: '', ubicacion: '', query: '',
  showSuggestions: false, indiceActivo: -1, error: false,
  consecutivo, aviso: null,
});

/** Propone el número siguiente al de la última fila; vacío si esa fila no tiene uno válido. */
const siguienteConsecutivo = (filas: FilaPerfil[]): string => {
  const ultimo = leerConsecutivo(filas[filas.length - 1]?.consecutivo ?? '');
  return ultimo ? String(ultimo + 1) : '';
};

const IngresarPerfilModal: React.FC<Props> = ({ onClose, onGuardado, conConsecutivo = false, onIngresoParcial }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [filas, setFilas] = useState<FilaPerfil[]>([newFila()]);
  const [guardando, setGuardando] = useState(false);
  const [ultimoConsecutivo, setUltimoConsecutivo] = useState<number | null>(null);

  const verificar = async (consecutivos: number[]): Promise<ResultadoVerificacion> => {
    const { data } = await axios.post<ResultadoVerificacion>(
      `${API}/api/inventario-perfileria/verificar-consecutivos`, { consecutivos }, { headers });
    return data;
  };

  // Referencia para el usuario: hasta dónde llega la numeración automática.
  useEffect(() => {
    if (!conConsecutivo) return;
    verificar([])
      .then(d => setUltimoConsecutivo(d.ultimo_consecutivo))
      .catch(() => setUltimoConsecutivo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conConsecutivo]);

  /** Al salir del campo: avisa si el número ya está en el inventario. */
  const verificarFila = async (uid: number, valor: string) => {
    const n = leerConsecutivo(valor);
    if (n === null) {
      updateFila(uid, 'aviso', valor.trim() ? 'Debe ser un número entero mayor que 0' : null);
      return;
    }
    try {
      const { ocupados } = await verificar([n]);
      // La fila pudo cambiar mientras respondía el servidor: solo se marca si sigue igual.
      setFilas(prev => prev.map(f => f.uid === uid && leerConsecutivo(f.consecutivo) === n
        ? { ...f, aviso: ocupados[0]?.motivo ?? null }
        : f));
    } catch {
      // Sin verificación previa el guardado igual rechaza los ocupados: no se bloquea al usuario.
    }
  };

  /** Consecutivos escritos más de una vez en el lote: la segunda fila se rechazaría. */
  const repetidosEnLote = new Set<number>();
  if (conConsecutivo) {
    const vistos = new Set<number>();
    filas.forEach(f => {
      const n = leerConsecutivo(f.consecutivo);
      if (n === null) return;
      if (vistos.has(n)) repetidosEnLote.add(n);
      vistos.add(n);
    });
  }

  const filaValida = (f: FilaPerfil) => {
    if (!f.codigo || !(Number(f.mm) > 0)) return false;
    if (!conConsecutivo) return true;
    const n = leerConsecutivo(f.consecutivo);
    return n !== null && !repetidosEnLote.has(n) && !f.aviso;
  };

  /**
   * Refs indexadas por `uid` y no por índice del arreglo: al eliminar una fila
   * los índices se recorren y el foco terminaría en la fila equivocada.
   */
  const buscarRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const mmRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [autoFocusUid, setAutoFocusUid] = useState<number | null>(null);

  useEffect(() => {
    getCatalogoCached()
      .then(setCatalogo)
      .catch(() => toast.error('Error al cargar catálogo'));
  }, []);

  /** Enfoca el buscador de la fila recién encadenada, ya montada por React. */
  useEffect(() => {
    if (autoFocusUid === null) return;
    buscarRefs.current.get(autoFocusUid)?.focus();
    setAutoFocusUid(null);
  }, [autoFocusUid]);

  const getSuggestions = (query: string): CatalogoItem[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return catalogo.filter(c =>
      (c.codigo?.toLowerCase() ?? '').includes(q) || (c.nombre?.toLowerCase() ?? '').includes(q)
    ).slice(0, MAX_SUGERENCIAS);
  };

  const updateFila = (uid: number, field: keyof FilaPerfil, value: any) => {
    setFilas(prev => prev.map(f => f.uid === uid ? { ...f, [field]: value } : f));
  };

  const handleQueryChange = (uid: number, value: string) => {
    setFilas(prev => prev.map(f => f.uid === uid
      ? { ...f, query: value, codigo: '', nombre: '', showSuggestions: true, indiceActivo: -1, error: false }
      : f
    ));
  };

  const seleccionarCatalogo = (uid: number, item: CatalogoItem) => {
    setFilas(prev => prev.map(f => f.uid === uid
      ? {
          ...f,
          codigo: item.codigo,
          nombre: item.nombre,
          query: `${item.codigo} — ${item.nombre}`,
          showSuggestions: false,
          indiceActivo: -1,
          error: false,
        }
      : f
    ));
    // El salto al siguiente campo espera al repintado de la fila.
    requestAnimationFrame(() => mmRefs.current.get(uid)?.focus());
  };

  /**
   * Cierra el desplegable y, si quedó texto suelto sin producto elegido, lo
   * borra y marca el campo. Antes ese texto permanecía a la vista y la fila se
   * descartaba en silencio al guardar: parecía cargada y no lo estaba.
   */
  const cerrarBuscador = (uid: number) => {
    setFilas(prev => prev.map(f => {
      if (f.uid !== uid) return f;
      const textoSuelto = !f.codigo && !!f.query.trim();
      return {
        ...f,
        query: textoSuelto ? '' : f.query,
        // `|| f.error` conserva el aviso ya marcado: Tab sin candidato llama aquí
        // de inmediato y el onBlur vuelve a llamar 150 ms después, ya con el texto
        // borrado; sin esto, el segundo paso apagaba el aviso recién encendido.
        error: textoSuelto || f.error,
        showSuggestions: false,
        indiceActivo: -1,
      };
    }));
  };

  const handleBuscarKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    fila: FilaPerfil,
    suggestions: CatalogoItem[],
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault(); // Si no, el cursor salta al extremo del texto.
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const siguiente = Math.min(Math.max(fila.indiceActivo + delta, 0), suggestions.length - 1);
      setFilas(prev => prev.map(f => f.uid === fila.uid
        ? { ...f, indiceActivo: siguiente, showSuggestions: true }
        : f
      ));
      return;
    }

    if (e.key === 'Escape') {
      setFilas(prev => prev.map(f => f.uid === fila.uid
        ? { ...f, showSuggestions: false, indiceActivo: -1 }
        : f
      ));
      return;
    }

    // Shift+Tab no se intercepta: la navegación hacia atrás queda intacta.
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      // Una única coincidencia se toma sin obligar a resaltarla primero.
      const elegido = fila.indiceActivo >= 0
        ? suggestions[fila.indiceActivo]
        : suggestions.length === 1 ? suggestions[0] : null;

      if (elegido) {
        e.preventDefault();
        seleccionarCatalogo(fila.uid, elegido);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault(); // Sin candidato, Enter no hace nada.
        return;
      }
      // Tab sin candidato: limpia el texto suelto y deja seguir el foco natural.
      cerrarBuscador(fila.uid);
    }
  };

  /** Tab desde la ubicación de la última fila encadena una fila nueva. */
  const handleUbicacionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, esUltima: boolean) => {
    if (e.key !== 'Tab' || e.shiftKey || !esUltima) return;
    e.preventDefault();
    const nueva = newFila(conConsecutivo ? siguienteConsecutivo(filas) : '');
    setFilas(prev => [...prev, nueva]);
    setAutoFocusUid(nueva.uid);
  };

  const eliminarFila = (uid: number) => {
    if (filas.length === 1) return;
    buscarRefs.current.delete(uid);
    mmRefs.current.delete(uid);
    setFilas(prev => prev.filter(f => f.uid !== uid));
  };

  /**
   * Lote con consecutivo: se envían las filas completas y el servidor guarda las válidas.
   * Las guardadas salen de la tabla; las rechazadas se quedan con su motivo para corregirlas
   * (decisión del usuario: un número ocupado no bloquea el resto del lote).
   */
  const guardarConConsecutivo = async () => {
    const completas = filas.filter(f => f.codigo && Number(f.mm) > 0 && leerConsecutivo(f.consecutivo) !== null);
    if (completas.length === 0) {
      toast.error('Agrega al menos un perfil con consecutivo, código y longitud válidos');
      return;
    }
    setGuardando(true);
    try {
      const items = completas.map(f => ({
        consecutivo: leerConsecutivo(f.consecutivo) as number,
        codigo: f.codigo,
        mm: Number(f.mm),
        ubicacion: f.ubicacion.trim() || null,
      }));
      const { data } = await axios.post<{ insertados: number; rechazados: { consecutivo: number; motivo: string }[] }>(
        `${API}/api/inventario-perfileria/bulk-manual`, { items }, { headers });

      if (data.rechazados.length === 0) {
        toast.success(`${data.insertados} perfil${data.insertados !== 1 ? 'es' : ''} ingresado${data.insertados !== 1 ? 's' : ''} con su consecutivo`);
        onGuardado();
        return;
      }

      // El servidor rechaza por número; si el mismo número estaba en dos filas, la
      // primera se guardó y solo la segunda vuelve con "Repetido dentro del lote".
      const motivos = new Map<number, string[]>();
      data.rechazados.forEach(r => motivos.set(r.consecutivo, [...(motivos.get(r.consecutivo) ?? []), r.motivo]));
      const enviadas = new Set(completas.map(f => f.uid));
      const quedan: FilaPerfil[] = [];
      [...filas].reverse().forEach(f => {
        const n = leerConsecutivo(f.consecutivo);
        const pendientes = n !== null ? motivos.get(n) : undefined;
        if (!enviadas.has(f.uid)) { quedan.unshift(f); return; }
        if (pendientes && pendientes.length > 0) {
          quedan.unshift({ ...f, aviso: pendientes.pop() as string });
        }
      });
      setFilas(quedan.length > 0 ? quedan : [newFila()]);
      toast.warn(`${data.insertados} guardado${data.insertados !== 1 ? 's' : ''}; ${data.rechazados.length} con consecutivo ocupado o repetido. Corrígelos y vuelve a guardar.`);
      if (data.insertados > 0) onIngresoParcial?.();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No se pudo guardar el lote. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = async () => {
    if (conConsecutivo) return guardarConConsecutivo();
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
            {conConsecutivo ? <Hash className="w-5 h-5 text-indigo-600" /> : <PackagePlus className="w-5 h-5 text-indigo-600" />}
            <h2 className="text-lg font-bold text-slate-900">{conConsecutivo ? 'Ingresar con consecutivo' : 'Ingresar Perfilería'}</h2>
            {conConsecutivo && ultimoConsecutivo !== null && (
              <span className="ml-2 text-xs text-slate-700">
                Último consecutivo: <span className="font-mono font-semibold tabular-nums">{ultimoConsecutivo}</span>
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabla de filas */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {conConsecutivo && (
                  <th className="pb-2 pr-2 text-left text-xs font-semibold text-slate-900 uppercase w-[16%]">Consecutivo *</th>
                )}
                <th className={`pb-2 text-left text-xs font-semibold text-slate-900 uppercase ${conConsecutivo ? 'w-[37%]' : 'w-[45%]'}`}>Código / Nombre *</th>
                <th className="pb-2 text-left text-xs font-semibold text-slate-900 uppercase w-[18%] px-2">Longitud (mm) *</th>
                <th className="pb-2 text-left text-xs font-semibold text-slate-900 uppercase w-[25%] px-2">Ubicación</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((fila, idx) => {
                const suggestions = getSuggestions(fila.query);
                const esUltima = idx === filas.length - 1;
                const bordeBuscador = fila.error
                  ? 'border-amber-400 bg-amber-50'
                  : fila.codigo ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200';
                return (
                  <tr key={fila.uid} className="group">
                    {conConsecutivo && (() => {
                      const n = leerConsecutivo(fila.consecutivo);
                      const aviso = fila.aviso ?? (n !== null && repetidosEnLote.has(n) ? 'Repetido en este lote' : null);
                      return (
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={fila.consecutivo}
                            onChange={e => setFilas(prev => prev.map(f => f.uid === fila.uid
                              ? { ...f, consecutivo: e.target.value.replace(/\D/g, ''), aviso: null }
                              : f))}
                            onBlur={e => verificarFila(fila.uid, e.target.value)}
                            placeholder="Ej: 11400"
                            aria-invalid={!!aviso}
                            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300 ${aviso ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                          />
                          {aviso && (
                            <p className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-amber-700">
                              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {aviso}
                            </p>
                          )}
                        </td>
                      );
                    })()}
                    {/* Autocomplete */}
                    <td className="py-2 pr-2 relative align-top">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-[19px] -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                          type="text"
                          ref={el => { if (el) buscarRefs.current.set(fila.uid, el); else buscarRefs.current.delete(fila.uid); }}
                          value={fila.query}
                          onChange={e => handleQueryChange(fila.uid, e.target.value)}
                          onKeyDown={e => handleBuscarKeyDown(e, fila, suggestions)}
                          onFocus={() => updateFila(fila.uid, 'showSuggestions', true)}
                          onBlur={() => setTimeout(() => cerrarBuscador(fila.uid), 150)}
                          placeholder="Buscar código o nombre..."
                          className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${bordeBuscador}`}
                        />
                        {fila.showSuggestions && suggestions.length > 0 && (
                          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-y-auto max-h-72">
                            {suggestions.map((s, i) => {
                              const activo = i === fila.indiceActivo;
                              return (
                                <button
                                  key={s.id}
                                  ref={el => { if (el && activo) el.scrollIntoView({ block: 'nearest' }); }}
                                  // preventDefault evita que el foco migre a este botón, que se
                                  // desmonta enseguida y dejaba el foco en el <body>: por eso el
                                  // Tab posterior reiniciaba el recorrido desde el inicio del modal.
                                  onMouseDown={e => { e.preventDefault(); seleccionarCatalogo(fila.uid, s); }}
                                  tabIndex={-1}
                                  className={`w-full text-left px-3 py-2 text-sm border-b border-slate-50 last:border-0 ${activo ? 'bg-indigo-100' : 'hover:bg-indigo-50'}`}>
                                  <span className="font-mono font-semibold text-indigo-700 text-xs">{s.codigo}</span>
                                  <span className="text-slate-800 ml-2 text-xs">{s.nombre}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {fila.error && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <AlertCircle className="w-3 h-3" /> Selecciona un producto del listado
                        </p>
                      )}
                    </td>

                    {/* mm */}
                    <td className="py-2 px-2 align-top">
                      <input
                        type="number"
                        ref={el => { if (el) mmRefs.current.set(fila.uid, el); else mmRefs.current.delete(fila.uid); }}
                        value={fila.mm}
                        onChange={e => updateFila(fila.uid, 'mm', e.target.value)}
                        placeholder="0"
                        min="1"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </td>

                    {/* Ubicación */}
                    <td className="py-2 px-2 align-top">
                      <input
                        type="text"
                        value={fila.ubicacion}
                        onChange={e => updateFila(fila.uid, 'ubicacion', e.target.value)}
                        onKeyDown={e => handleUbicacionKeyDown(e, esUltima)}
                        placeholder="Ej: P-01"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </td>

                    {/* Eliminar fila */}
                    <td className="py-2 text-center align-top">
                      <button onClick={() => eliminarFila(fila.uid)}
                        disabled={filas.length === 1}
                        tabIndex={-1}
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
          <button onClick={() => setFilas(prev => [...prev, newFila(conConsecutivo ? siguienteConsecutivo(prev) : '')])}
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-800 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-all">
            <Plus className="w-4 h-4" /> Agregar otro perfil
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-700">
            {filas.filter(filaValida).length} de {filas.length} fila{filas.length !== 1 ? 's' : ''} válida{filas.filter(filaValida).length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2.5 font-semibold text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={guardando}
              className="px-5 py-2.5 font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-200 disabled:opacity-50 text-sm flex items-center gap-2">
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
