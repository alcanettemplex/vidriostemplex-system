import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Edit3, AlertCircle, ChevronDown, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import sistemasSAP from '../data/sap-sistemas.json';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface SAPItem {
  id?: number;
  item: string;
  codigo: string;
  descripcion: string;
  dimension: string;
  und: string;
  cantidad: number | string;
}

interface SAP {
  id: number;
  numero_sap: string;
  odp_id: number;
  notas: string;
  estado: string;
  fecha_creacion: string;
  asesor: { id: number; nombre_completo: string };
  items: SAPItem[];
}

interface Props {
  odp: any;
  onClose: () => void;
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const emptyItem = (idx: number): SAPItem => ({
  item: LETRAS[idx] || String(idx + 1),
  codigo: '', descripcion: '', dimension: '', und: '', cantidad: 1,
});

// ─── Autocomplete cell ────────────────────────────────────────────────────────
const AutocompleteCell: React.FC<{
  value: string;
  campo: 'codigo' | 'descripcion';
  onChange: (codigo: string, descripcion: string) => void;
  placeholder?: string;
}> = ({ value, campo, onChange, placeholder }) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<any>(null);
  const token = localStorage.getItem('token');

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buscar = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/api/documentos/sap/catalogo/buscar?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data);
        setOpen(res.data.length > 0);
      } catch { setResults([]); }
    }, 250);
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    buscar(e.target.value);
    // Actualizar valor libre mientras escribe
    if (campo === 'codigo') onChange(e.target.value, '');
    else onChange('', e.target.value);
  };

  const handleSelect = (item: any) => {
    setQuery(campo === 'codigo' ? item.codigo : item.nombre);
    onChange(item.codigo, item.nombre);
    setResults([]);
    setOpen(false);
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative w-full" ref={ref}>
      <input
        value={query}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent px-2 py-1.5 text-xs focus:outline-none focus:bg-blue-50 rounded transition"
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-h-52 overflow-y-auto"
          >
            {results.map((r: any) => (
              <button
                key={r.id}
                onMouseDown={() => handleSelect(r)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 transition border-b border-slate-50 last:border-0"
              >
                <span className="font-mono text-[10px] font-bold text-blue-700 shrink-0 mt-0.5 w-20">{r.codigo}</span>
                <span className="text-xs text-slate-700 leading-tight">{r.nombre}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Tabla editable SAP ───────────────────────────────────────────────────────
const TablaEditable: React.FC<{
  items: SAPItem[];
  onChange: (items: SAPItem[]) => void;
  canEdit: boolean;
}> = ({ items, onChange, canEdit }) => {

  const updateItem = (idx: number, field: keyof SAPItem, val: any) => {
    onChange(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const updateCodigoDesc = (idx: number, codigo: string, descripcion: string) => {
    onChange(items.map((it, i) => {
      if (i !== idx) return it;
      return {
        ...it,
        codigo: codigo || it.codigo,
        descripcion: descripcion || it.descripcion,
      };
    }));
  };

  const addRow = () => {
    onChange([...items, emptyItem(items.length)]);
  };

  const removeRow = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx)
      .map((it, i) => ({ ...it, item: LETRAS[i] || String(i + 1) }));
    onChange(updated);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-700 text-white text-[10px] uppercase tracking-wider">
            <th className="px-3 py-2 text-center w-10">ITEM</th>
            <th className="px-3 py-2 w-28">CÓDIGO</th>
            <th className="px-3 py-2">DESCRIPCIÓN</th>
            <th className="px-3 py-2 w-24">DIMENSIÓN</th>
            <th className="px-3 py-2 text-center w-14">UND</th>
            <th className="px-3 py-2 text-center w-16">CANT.</th>
            {canEdit && <th className="w-8"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition`}>
              {/* ITEM */}
              <td className="px-3 py-1 text-center font-black text-slate-600 text-sm">{item.item}</td>
              {/* CÓDIGO */}
              <td className="px-1 py-0.5 border-x border-slate-100">
                {canEdit ? (
                  <AutocompleteCell
                    value={item.codigo}
                    campo="codigo"
                    placeholder="Código..."
                    onChange={(cod, desc) => updateCodigoDesc(idx, cod, desc || item.descripcion)}
                  />
                ) : (
                  <span className="font-mono text-blue-700 font-bold px-2">{item.codigo || '—'}</span>
                )}
              </td>
              {/* DESCRIPCIÓN */}
              <td className="px-1 py-0.5 border-r border-slate-100">
                {canEdit ? (
                  <AutocompleteCell
                    value={item.descripcion}
                    campo="descripcion"
                    placeholder="Descripción..."
                    onChange={(cod, desc) => updateCodigoDesc(idx, cod || item.codigo, desc)}
                  />
                ) : (
                  <span className="px-2 text-slate-700">{item.descripcion || '—'}</span>
                )}
              </td>
              {/* DIMENSIÓN */}
              <td className="px-1 py-0.5 border-r border-slate-100">
                {canEdit ? (
                  <input
                    value={item.dimension}
                    onChange={e => updateItem(idx, 'dimension', e.target.value)}
                    placeholder="Ej: 2400mm"
                    className="w-full border-0 bg-transparent px-2 py-1.5 text-xs focus:outline-none focus:bg-blue-50 rounded transition"
                  />
                ) : (
                  <span className="px-2 text-slate-600">{item.dimension || '—'}</span>
                )}
              </td>
              {/* UND */}
              <td className="px-1 py-0.5 border-r border-slate-100 text-center">
                {canEdit ? (
                  <input
                    value={item.und || ''}
                    onChange={e => updateItem(idx, 'und', e.target.value)}
                    placeholder="ML"
                    className="w-full border-0 bg-transparent px-2 py-1.5 text-xs text-center focus:outline-none focus:bg-blue-50 rounded transition"
                  />
                ) : (
                  <span className="px-2 text-slate-600">{item.und || '—'}</span>
                )}
              </td>
              {/* CANTIDAD */}
              <td className="px-1 py-0.5 border-r border-slate-100 text-center">
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.cantidad}
                    onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-1.5 text-xs text-center focus:outline-none focus:bg-blue-50 rounded transition"
                  />
                ) : (
                  <span className="px-2 font-bold text-slate-700">{item.cantidad}</span>
                )}
              </td>
              {/* ELIMINAR FILA */}
              {canEdit && (
                <td className="px-1 text-center">
                  {items.length > 1 && (
                    <button onClick={() => removeRow(idx)} className="p-1 text-slate-300 hover:text-red-500 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 mt-2 ml-2 text-xs font-bold text-blue-600 hover:text-blue-800 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar fila
        </button>
      )}
    </div>
  );
};

// ─── Modal selector de sistema ────────────────────────────────────────────────
const SelectorSistema: React.FC<{
  onSelect: (items: SAPItem[]) => void;
  onCancel: () => void;
}> = ({ onSelect, onCancel }) => {
  const [sistema, setSistema] = useState('');
  const [color, setColor] = useState('');
  // opcionales con toggle (por clave de letra)
  const [toggledOpts, setToggledOpts] = useState<Record<string, boolean>>({});
  // persiana toggle
  const [persianaOn, setPersianaOn] = useState(false);
  // selección de brazo, manija, chapa, riel
  const [brazoSel, setBrazoSel] = useState<{ item: string; cod: string; label: string } | null>(null);
  const [manijaSel, setManijaSel] = useState<{ item: string; cod: string; label: string } | null>(null);
  const [chapaSel, setChapaSel] = useState<{ item: string; cod: string; desc: string } | null>(null);
  const [rielSel, setRielSel] = useState<{ item: string; cod: string; label: string } | null>(null);

  const sistemas = sistemasSAP as Record<string, any>;
  const sistemaActual = sistema ? sistemas[sistema] : null;
  const colores: string[] = sistemaActual?.colores || [];
  const perfiles: Record<string, any> = sistemaActual?.perfiles || {};

  const resetOpciones = () => {
    setToggledOpts({});
    setPersianaOn(false);
    setBrazoSel(null);
    setManijaSel(null);
    setChapaSel(null);
    setRielSel(null);
  };

  const codigoOpt = (opt: any): string => {
    if (opt.porColor) return (color && opt.codes?.[color]) ? opt.codes[color] : '';
    return opt.cod || '';
  };

  const handleConfirmar = () => {
    if (!sistema) { toast.error('Selecciona un sistema'); return; }
    const s = sistemaActual;
    const items: SAPItem[] = [];

    // Sistema sin perfiles ni fijos → vacío
    const tieneContenido = Object.keys(perfiles).length > 0
      || (s.fijos && s.fijos.length > 0)
      || (s.universales && s.universales.length > 0)
      || s.rieles;

    if (!tieneContenido) {
      onSelect([emptyItem(0)]);
      toast.info('Sistema sin perfiles predefinidos, puedes ingresar manualmente');
      return;
    }

    // 1. Fijos sin color (pta-tiporoma)
    (s.fijos || []).forEach((f: any) => {
      items.push({ item: f.item, codigo: f.cod, descripcion: f.desc, dimension: '', und: '', cantidad: 1 });
    });

    // 2. Perfiles por color
    Object.entries(perfiles).forEach(([letra, data]: [string, any]) => {
      const cod = color && data.codes?.[color] ? data.codes[color] : '';
      items.push({ item: letra, codigo: cod, descripcion: data.desc || '', dimension: '', und: '', cantidad: 1 });
    });

    // 3. Universales (sin color)
    (s.universales || []).forEach((u: any) => {
      items.push({ item: u.item, codigo: u.cod, descripcion: u.desc, dimension: '', und: '', cantidad: 1 });
    });

    // 4. Persiana (toggle)
    if (s.persiana && persianaOn) {
      const cod = color && s.persiana.codes?.[color] ? s.persiana.codes[color] : '';
      items.push({ item: s.persiana.item, codigo: cod, descripcion: s.persiana.desc, dimension: '', und: '', cantidad: 1 });
    }

    // 5. Brazos (selector)
    if (brazoSel) {
      items.push({ item: brazoSel.item, codigo: brazoSel.cod, descripcion: `Brazo ${brazoSel.label}`, dimension: '', und: '', cantidad: 1 });
    }

    // 6. Manijas (selector)
    if (manijaSel) {
      items.push({ item: manijaSel.item, codigo: manijaSel.cod, descripcion: `Manija ${manijaSel.label}`, dimension: '', und: '', cantidad: 1 });
    }

    // 7. Opcionales por toggle (opcionales + opcionales3r)
    const todosOpts: Record<string, any> = { ...(s.opcionales || {}), ...(s.opcionales3r || {}) };
    Object.entries(todosOpts).forEach(([letra, opt]: [string, any]) => {
      if (toggledOpts[letra]) {
        const cod = codigoOpt(opt);
        items.push({ item: letra, codigo: cod, descripcion: opt.desc, dimension: '', und: '', cantidad: 1 });
      }
    });

    // 8. Riel seleccionado (optiglass)
    if (rielSel) {
      items.push({ item: rielSel.item, codigo: rielSel.cod, descripcion: `Riel ${rielSel.label} Mate`, dimension: '', und: '', cantidad: 1 });
    }

    // 9. Chapa seleccionada
    if (chapaSel) {
      items.push({ item: chapaSel.item, codigo: chapaSel.cod, descripcion: chapaSel.desc, dimension: '', und: '', cantidad: 1 });
    }

    // Re-asignar letras en orden
    const itemsOrdenados = items.map((it, i) => ({ ...it, item: LETRAS[i] || String(i + 1) }));
    onSelect(itemsOrdenados.length > 0 ? itemsOrdenados : [emptyItem(0)]);
  };

  const TodosOpts = sistemaActual
    ? { ...(sistemaActual.opcionales || {}), ...(sistemaActual.opcionales3r || {}) }
    : {};

  return (
    <div className="p-6 space-y-5">
      {/* SELECTOR SISTEMA */}
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Sistema</label>
        <div className="relative">
          <select
            value={sistema}
            onChange={e => { setSistema(e.target.value); setColor(''); resetOpciones(); }}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none bg-white"
          >
            <option value="">Selecciona el sistema...</option>
            {Object.entries(sistemas).map(([key, val]: [string, any]) => (
              <option key={key} value={key}>{val.nombre}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* COLOR */}
      {sistemaActual && colores.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Color / Acabado</label>
          <div className="flex flex-wrap gap-2">
            {colores.map((c: string) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition ${color === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* VISTA PREVIA PERFILES */}
      {sistemaActual && Object.keys(perfiles).length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Perfiles del sistema</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-slate-500 w-10">ITEM</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">DESCRIPCIÓN</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500 w-28">CÓDIGO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(perfiles).map(([letra, data]: [string, any]) => (
                  <tr key={letra}>
                    <td className="px-3 py-1.5 font-black text-slate-600">{letra}</td>
                    <td className="px-3 py-1.5 text-slate-700">{data.desc}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">
                      {color && data.codes?.[color] ? data.codes[color] : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACCESORIOS FIJOS (pta-tiporoma) */}
      {sistemaActual?.fijos && sistemaActual.fijos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Accesorios fijos</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {sistemaActual.fijos.map((f: any) => (
                  <tr key={f.item}>
                    <td className="px-3 py-1.5 font-black text-slate-600 w-10">{f.item}</td>
                    <td className="px-3 py-1.5 text-slate-700">{f.desc}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold w-28">{f.cod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UNIVERSALES */}
      {sistemaActual?.universales && sistemaActual.universales.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Accesorios universales</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {sistemaActual.universales.map((u: any) => (
                  <tr key={u.item}>
                    <td className="px-3 py-1.5 font-black text-slate-600 w-10">{u.item}</td>
                    <td className="px-3 py-1.5 text-slate-700">{u.desc}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold w-28">{u.cod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PERSIANA (toggle) */}
      {sistemaActual?.persiana && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Persiana (opcional)</span>
            <button
              onClick={() => setPersianaOn(!persianaOn)}
              className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${persianaOn ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}
            >
              {persianaOn ? 'ON' : 'OFF'}
            </button>
          </div>
          {persianaOn && color && (
            <p className="text-xs font-mono text-blue-700 font-bold">
              {sistemaActual.persiana.codes?.[color] || '—'}
              <span className="text-slate-500 font-normal ml-2">{sistemaActual.persiana.desc}</span>
            </p>
          )}
        </div>
      )}

      {/* BRAZOS (selector) */}
      {sistemaActual?.brazos && sistemaActual.brazos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Brazo (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {sistemaActual.brazos.map((b: any) => (
              <button
                key={b.item}
                onClick={() => setBrazoSel(brazoSel?.item === b.item ? null : b)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${brazoSel?.item === b.item ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
              >
                {b.label} <span className="font-mono text-[10px]">{b.cod}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MANIJAS (selector) */}
      {sistemaActual?.manijas && sistemaActual.manijas.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Manija (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {sistemaActual.manijas.map((m: any) => (
              <button
                key={m.item}
                onClick={() => setManijaSel(manijaSel?.item === m.item ? null : m)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${manijaSel?.item === m.item ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
              >
                {m.label} <span className="font-mono text-[10px]">{m.cod}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RIELES (optiglass) */}
      {sistemaActual?.rieles && sistemaActual.rieles.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de riel <span className="text-red-400">*</span></p>
          <div className="flex flex-wrap gap-2">
            {sistemaActual.rieles.map((r: any) => (
              <button
                key={r.item}
                onClick={() => setRielSel(rielSel?.item === r.item ? null : r)}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition ${rielSel?.item === r.item ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}`}
              >
                Riel {r.label} <span className="font-mono text-[10px]">{r.cod}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OPCIONALES CON TOGGLE */}
      {Object.keys(TodosOpts).length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Opcionales</p>
          <div className="space-y-2">
            {Object.entries(TodosOpts).map(([letra, opt]: [string, any]) => (
              <div key={letra} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-2.5">
                <div>
                  <span className="text-xs font-black text-slate-600 mr-2">{letra}</span>
                  <span className="text-xs text-slate-700">{opt.desc}</span>
                  {toggledOpts[letra] && (
                    <span className="ml-2 font-mono text-[10px] font-bold text-blue-700">
                      {codigoOpt(opt) || '—'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setToggledOpts(prev => ({ ...prev, [letra]: !prev[letra] }))}
                  className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${toggledOpts[letra] ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}
                >
                  {toggledOpts[letra] ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CHAPAS (selector) */}
      {sistemaActual?.chapas && sistemaActual.chapas.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Chapa (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {sistemaActual.chapas.map((ch: any) => (
              <button
                key={ch.item}
                onClick={() => setChapaSel(chapaSel?.item === ch.item ? null : ch)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${chapaSel?.item === ch.item ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
              >
                {ch.desc} <span className="font-mono text-[10px]">{ch.cod}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
          Cancelar
        </button>
        <button
          onClick={handleConfirmar}
          disabled={!sistema || (sistemaActual?.rieles?.length > 0 && !rielSel)}
          className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
        >
          Cargar sistema →
        </button>
      </div>
    </div>
  );
};

// ─── Modal principal ──────────────────────────────────────────────────────────
const SAPModal: React.FC<Props> = ({ odp, onClose }) => {
  const [saps, setSaps] = useState<SAP[]>([]);
  const [mode, setMode] = useState<'list' | 'create-choose' | 'selector' | 'editor' | 'view'>('list');
  const [editingSap, setEditingSap] = useState<SAP | null>(null);
  const [items, setItems] = useState<SAPItem[]>([emptyItem(0)]);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const user = useSelector((state: any) => state.auth.user);
  const userRole = (user?.rol || user?.role)?.toLowerCase() || '';
  const token = localStorage.getItem('token');

  const canEdit = userRole === 'admin' ||
    userRole === 'jefe_produccion' ||
    userRole === 'gerencia' ||
    odp?.asesor_id === user?.id ||
    odp?.asesor?.id === user?.id;

  const fetchSAPs = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/documentos/sap/odp/${odp.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSaps(res.data);
    } catch { setSaps([]); }
  }, [odp.id, token]);

  useEffect(() => { fetchSAPs(); }, [fetchSAPs]);

  const handleGuardar = async () => {
    const itemsValidos = items.filter(i => i.codigo.trim() || i.descripcion.trim());
    if (itemsValidos.length === 0) { toast.error('Agrega al menos un ítem'); return; }
    setLoading(true);
    try {
      if (editingSap) {
        await axios.put(`${API}/api/documentos/sap/${editingSap.id}`,
          { notas, items: itemsValidos },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('SAP actualizada');
      } else {
        const res = await axios.post(`${API}/api/documentos/sap`,
          { odp_id: odp.id, notas, items: itemsValidos },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(`SAP ${res.data.numero_sap} creada`);
      }
      fetchSAPs();
      setMode('list');
      setEditingSap(null);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar SAP');
    } finally { setLoading(false); }
  };

  const handleEliminar = async (id: number) => {
    try {
      await axios.delete(`${API}/api/documentos/sap/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('SAP eliminada');
      setDeletingId(null);
      fetchSAPs();
    } catch { toast.error('Error al eliminar SAP'); }
  };

  const handleEditar = (sap: SAP) => {
    setEditingSap(sap);
    setItems(sap.items.length > 0 ? sap.items : [emptyItem(0)]);
    setNotas(sap.notas || '');
    setMode('editor');
  };

  const abrirEditor = (itemsIniciales?: SAPItem[]) => {
    setItems(itemsIniciales || [emptyItem(0)]);
    setNotas('');
    setEditingSap(null);
    setMode('editor');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">SAP — Solicitud de Accesorios y Perfilería</h2>
            <p className="text-xs text-slate-500 font-medium">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'list' && canEdit && saps.length === 0 && (
              <button
                onClick={() => setMode('create-choose')}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
              >
                <Plus className="w-4 h-4" /> Crear SAP
              </button>
            )}
            {(mode === 'editor' || mode === 'selector' || mode === 'create-choose') && (
              <button onClick={() => setMode('list')} className="px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition">
                ← Volver
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── LISTADO ── */}
          {mode === 'list' && (
            <div className="p-6 space-y-3">
              {saps.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Search className="w-14 h-14 mx-auto mb-3 text-slate-200" />
                  <p className="font-bold text-lg text-slate-500">Sin SAPs registradas</p>
                  <p className="text-sm mt-1">Crea la solicitud de accesorios y perfilería para esta ODP.</p>
                </div>
              ) : saps.map(sap => (
                <div key={sap.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-indigo-700 text-lg">{sap.numero_sap}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {sap.estado}
                      </span>
                      <span className="text-xs text-slate-400">{sap.items.length} ítem(s) · {sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</span>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button onClick={() => handleEditar(sap)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-indigo-200 text-indigo-700 bg-white rounded-lg hover:bg-indigo-50 transition">
                          <Edit3 className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button onClick={() => setDeletingId(sap.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Vista previa tabla */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-700 text-white">
                        <tr>
                          <th className="px-3 py-1.5 text-center w-10">ITEM</th>
                          <th className="px-3 py-1.5 w-28">CÓDIGO</th>
                          <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                          <th className="px-3 py-1.5 w-24">DIMENSIÓN</th>
                          <th className="px-3 py-1.5 text-center w-16">CANT.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sap.items.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-1.5 text-center font-black text-slate-600">{item.item}</td>
                            <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-700">{item.descripcion || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-500">{item.dimension || '—'}</td>
                            <td className="px-3 py-1.5 text-center font-bold">{item.cantidad}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sap.notas && <p className="px-5 py-2 text-xs text-slate-500 italic border-t border-slate-100">"{sap.notas}"</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── ELEGIR TIPO ── */}
          {mode === 'create-choose' && (
            <div className="p-10 flex flex-col items-center justify-center gap-6">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">¿Cómo quieres crear la SAP?</p>
              <div className="flex gap-4 w-full max-w-md">
                <button
                  onClick={() => abrirEditor()}
                  className="flex-1 py-8 flex flex-col items-center gap-3 border-2 border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 transition group"
                >
                  <Edit3 className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 transition" />
                  <span className="font-bold text-slate-700 group-hover:text-indigo-700">Manual</span>
                  <span className="text-xs text-slate-400 text-center px-4">Ingresa los códigos y descripciones directamente</span>
                </button>
                <button
                  onClick={() => setMode('selector')}
                  className="flex-1 py-8 flex flex-col items-center gap-3 border-2 border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 transition group"
                >
                  <Search className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 transition" />
                  <span className="font-bold text-slate-700 group-hover:text-indigo-700">Por Sistema</span>
                  <span className="text-xs text-slate-400 text-center px-4">Elige el sistema y color para autocompletar</span>
                </button>
              </div>
            </div>
          )}

          {/* ── SELECTOR DE SISTEMA ── */}
          {mode === 'selector' && (
            <SelectorSistema
              onSelect={(itemsGenerados) => abrirEditor(itemsGenerados)}
              onCancel={() => setMode('create-choose')}
            />
          )}

          {/* ── EDITOR ── */}
          {mode === 'editor' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  {editingSap ? `Editando ${editingSap.numero_sap}` : 'Nueva SAP'}
                </h3>
                {editingSap && (
                  <span className="text-xs text-slate-400">Puedes editar cualquier celda libremente</span>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <TablaEditable items={items} onChange={setItems} canEdit={true} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones / Notas</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Notas adicionales para producción o compras..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => { setMode('list'); setEditingSap(null); }} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={loading} className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-50">
                  {loading ? 'Guardando...' : editingSap ? 'Actualizar SAP' : 'Guardar SAP'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Confirmación eliminar */}
      <AnimatePresence>
        {deletingId !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 mb-2">¿Eliminar esta SAP?</h3>
              <p className="text-sm text-slate-500 mb-5">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button onClick={() => handleEliminar(deletingId!)} className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition">Sí, eliminar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SAPModal;
