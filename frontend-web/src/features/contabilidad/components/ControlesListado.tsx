import React from 'react';
import { Search, X } from '../../../components/ui/icons';

// Controles comunes de los listados de Contabilidad: antes cada pestaña tenía su propio
// input (con reglas distintas: solo uno recortaba espacios) y Pagos su propio paginador.

interface CampoBusquedaProps {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Muestra un indicador mientras la búsqueda se resuelve en el servidor. */
  buscando?: boolean;
  className?: string;
}

export const CampoBusqueda: React.FC<CampoBusquedaProps> = ({
  valor, onChange, placeholder = 'Buscar ODP, cliente, NIT, asesor o FE…', buscando, className = 'w-72',
}) => (
  <div className={`relative ${className}`}>
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    <input
      type="text"
      value={valor}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape' && valor) { e.stopPropagation(); onChange(''); } }}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-500 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
    />
    {buscando ? (
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
    ) : valor ? (
      <button type="button" onClick={() => onChange('')} title="Limpiar búsqueda"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100">
        <X className="w-3 h-3" />
      </button>
    ) : null}
  </div>
);

interface PaginadorProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  /** Texto del total, p. ej. "pagos" u "ODPs". */
  unidad: string;
  onCambiar: (pagina: number) => void;
}

export const Paginador: React.FC<PaginadorProps> = ({ pagina, totalPaginas, total, unidad, onCambiar }) => (
  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
    <span className="text-xs text-slate-700">{total} {unidad} en total</span>
    {totalPaginas > 1 && (
      <div className="flex items-center gap-2">
        <button
          disabled={pagina <= 1}
          onClick={() => onCambiar(pagina - 1)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >‹ Anterior</button>
        <span className="text-xs text-slate-800 font-medium">Página {pagina} de {totalPaginas}</span>
        <button
          disabled={pagina >= totalPaginas}
          onClick={() => onCambiar(pagina + 1)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >Siguiente ›</button>
      </div>
    )}
  </div>
);
