import React from 'react';

/**
 * Avatar de iniciales. Neutro a propósito: un degradado distinto por persona (o un tono
 * calculado del nombre) competía con los colores de las gráficas y los estados.
 * `color` opcional: un anillo con el color fijo de la entidad, para enlazar la persona con
 * su serie en una gráfica.
 */
export const Iniciales: React.FC<{ nombre: string; tamano?: number; color?: string; className?: string }> = ({
  nombre, tamano = 32, color, className = '',
}) => {
  const ini = (nombre || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      className={`rounded-full bg-slate-100 text-slate-800 font-semibold flex items-center justify-center shrink-0 ring-2 ${className}`}
      style={{ width: tamano, height: tamano, fontSize: Math.max(11, tamano * 0.36), ['--tw-ring-color' as string]: color ?? '#e1e5eb' }}
      aria-hidden
    >
      {ini}
    </span>
  );
};

export default Iniciales;
