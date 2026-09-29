import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Star, CornerDownLeft } from '../ui/icons';
import { ItemMenu, areaPorId, normalizar } from './navegacion';
import type { Favoritos } from './useFavoritos';

/**
 * Buscador de módulos (Ctrl+K / ⌘K). Busca SOLO entre los módulos que el rol puede ver, por
 * nombre, área, descripción y palabras clave, sin tildes. Todo en el navegador: no consulta la BD.
 * Con la caja vacía muestra primero los favoritos y luego todos los módulos por área.
 *
 * No busca registros (ODP, clientes, leads): eso sería conectar /api/search, una función aparte.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  items: ItemMenu[];
  favoritos: Favoritos;
}

type Fila = { tipo: 'titulo'; texto: string } | { tipo: 'item'; item: ItemMenu };

const puntaje = (item: ItemMenu, q: string): number => {
  const nombre = normalizar(item.text);
  if (nombre.startsWith(q)) return 3;
  if (nombre.includes(q)) return 2;
  const resto = normalizar(`${areaPorId(item.area).label} ${item.descripcion} ${item.claves ?? ''}`);
  return q.split(/\s+/).every(p => resto.includes(p) || nombre.includes(p)) ? 1 : 0;
};

const LanzadorModulos: React.FC<Props> = ({ abierto, onCerrar, items, favoritos }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto) { setQ(''); setActivo(0); setTimeout(() => input.current?.focus(), 0); }
  }, [abierto]);

  const filas: Fila[] = useMemo(() => {
    const consulta = normalizar(q.trim());
    if (consulta) {
      return items
        .map(item => ({ item, p: puntaje(item, consulta) }))
        .filter(x => x.p > 0)
        .sort((a, b) => b.p - a.p)
        .map(x => ({ tipo: 'item' as const, item: x.item }));
    }
    const out: Fila[] = [];
    const favs = items.filter(i => favoritos.esFavorito(i.path));
    if (favs.length) {
      out.push({ tipo: 'titulo', texto: 'Favoritos' });
      favs.forEach(item => out.push({ tipo: 'item', item }));
    }
    const porArea = new Map<string, ItemMenu[]>();
    items.forEach(i => porArea.set(i.area, [...(porArea.get(i.area) ?? []), i]));
    porArea.forEach((grupo, area) => {
      out.push({ tipo: 'titulo', texto: areaPorId(grupo[0].area).label || area });
      grupo.forEach(item => out.push({ tipo: 'item', item }));
    });
    return out;
  }, [q, items, favoritos]);

  const seleccionables = filas.filter((f): f is { tipo: 'item'; item: ItemMenu } => f.tipo === 'item');

  useEffect(() => { setActivo(0); }, [q]);
  useEffect(() => {
    lista.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  if (!abierto) return null;

  const abrir = (item: ItemMenu) => { onCerrar(); navigate(item.path); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(a + 1, seleccionables.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = seleccionables[activo]; if (it) abrir(it.item); }
    else if (e.key === 'Escape') { e.preventDefault(); onCerrar(); }
  };

  let indice = -1;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Buscar módulo">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onCerrar} />
      <div className="relative w-full max-w-[560px] bg-white rounded-2xl shadow-float ring-1 ring-slate-200 overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200">
          <Search size={18} className="text-slate-500 shrink-0" />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar módulo… (ej. caja, rutas, precios)"
            className="flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-500 outline-none"
            role="combobox" aria-expanded="true" aria-controls="lanzador-lista" aria-autocomplete="list" />
          <kbd className="hidden sm:inline text-[11px] font-semibold text-slate-700 bg-slate-100 ring-1 ring-slate-200 rounded-md px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={lista} id="lanzador-lista" role="listbox" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {seleccionables.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">Ningún módulo coincide con «{q}»</p>
              <p className="text-[12px] text-slate-700 mt-1">Busca por nombre o por lo que haces en él: «caja», «rutas», «precios».</p>
            </div>
          )}
          {filas.map((f, i) => {
            if (f.tipo === 'titulo') {
              return <p key={`t-${f.texto}-${i}`} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700">{f.texto}</p>;
            }
            indice += 1;
            const miIndice = indice;
            const sel = miIndice === activo;
            const Icono = f.item.icon;
            const fav = favoritos.esFavorito(f.item.path);
            return (
              <div key={`${f.item.path}-${i}`} role="option" aria-selected={sel} data-activo={sel}
                onMouseMove={() => setActivo(miIndice)}
                className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 cursor-pointer ${sel ? 'bg-templex-50 ring-1 ring-inset ring-templex-100' : ''}`}
                onClick={() => abrir(f.item)}>
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-templex-50 text-templex-600 ring-1 ring-inset ring-templex-100 shrink-0">
                  <Icono size={17} weight="duotone" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold text-slate-900 truncate">{f.item.text}</span>
                  <span className="block text-[12px] text-slate-700 truncate">{areaPorId(f.item.area).label} · {f.item.descripcion}</span>
                </span>
                <button type="button" onClick={(e) => { e.stopPropagation(); favoritos.alternar(f.item.path); }}
                  aria-pressed={fav} aria-label={fav ? `Quitar ${f.item.text} de favoritos` : `Agregar ${f.item.text} a favoritos`}
                  className={`grid place-items-center w-7 h-7 rounded-lg shrink-0 ${fav ? 'text-amber-500' : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:text-amber-500'} ${sel ? 'opacity-100' : ''}`}>
                  <Star size={15} weight={fav ? 'fill' : 'bold'} />
                </button>
                {sel && <CornerDownLeft size={15} className="text-slate-500 shrink-0" />}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 h-10 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-700">
          <span><kbd className="font-semibold">↑ ↓</kbd> navegar</span>
          <span><kbd className="font-semibold">Enter</kbd> abrir</span>
          <span><kbd className="font-semibold">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LanzadorModulos;
