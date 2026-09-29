import React from 'react';

export interface ItemLeyenda {
  label: string;
  color: string;
  /** `linea` para series dibujadas como línea; `barra` (por defecto) para rellenos. */
  forma?: 'barra' | 'linea';
}

/** Leyenda en una fila, sobre la gráfica. Obligatoria cuando hay 2 o más series. */
export const Leyenda: React.FC<{ items: ItemLeyenda[]; className?: string }> = ({ items, className = '' }) => (
  <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${className}`}>
    {items.map(item => (
      <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-slate-800">
        {item.forma === 'linea'
          ? <span className="w-3.5 h-[2px] rounded-full inline-block" style={{ background: item.color }} />
          : <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.color }} />}
        {item.label}
      </span>
    ))}
  </div>
);

export default Leyenda;
