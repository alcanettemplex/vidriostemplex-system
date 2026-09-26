import React from 'react';
import { motion } from 'framer-motion';
import type { IconComponent } from '../ui/icons';

/**
 * Anatomía única de las tarjetas de KPI del dashboard (Fase 3 del rediseño, 2026-09-25).
 *
 * Solo presentación: no calcula nada, recibe la cifra ya formateada.
 *
 *   ┌──────────────────────────────┐
 *   │ RÓTULO (hasta 2 líneas)  [ic] │  ← altura mínima fija: las cifras quedan alineadas
 *   │ $284,6M                       │  ← fila propia, a todo el ancho, sin partir
 *   │ Descripción en texto normal   │
 *   │ …contenido extra (children)   │
 *   └──────────────────────────────┘
 *
 * La cifra va en su propia fila y no al lado del icono porque los montos en COP son largos
 * y se cortaban. El rótulo reserva dos renglones aunque ocupe uno, para que todas las cifras
 * de una misma fila de tarjetas caigan a la misma altura.
 */

export type TonoKPI = 'indigo' | 'emerald' | 'rose' | 'amber' | 'blue' | 'violet' | 'slate';

const TONOS: Record<TonoKPI, { fondo: string; icono: string; resplandor: string }> = {
  indigo:  { fondo: 'bg-indigo-50 ring-indigo-100',   icono: 'text-indigo-600',  resplandor: '0 12px 28px -8px rgba(79,70,229,0.22)' },
  emerald: { fondo: 'bg-emerald-50 ring-emerald-100', icono: 'text-emerald-600', resplandor: '0 12px 28px -8px rgba(5,150,105,0.20)' },
  rose:    { fondo: 'bg-rose-50 ring-rose-100',       icono: 'text-rose-600',    resplandor: '0 12px 28px -8px rgba(225,29,72,0.20)' },
  amber:   { fondo: 'bg-amber-50 ring-amber-100',     icono: 'text-amber-600',   resplandor: '0 12px 28px -8px rgba(217,119,6,0.20)' },
  blue:    { fondo: 'bg-blue-50 ring-blue-100',       icono: 'text-blue-600',    resplandor: '0 12px 28px -8px rgba(37,99,235,0.20)' },
  violet:  { fondo: 'bg-violet-50 ring-violet-100',   icono: 'text-violet-600',  resplandor: '0 12px 28px -8px rgba(124,58,237,0.20)' },
  slate:   { fondo: 'bg-slate-100 ring-slate-200',    icono: 'text-slate-700',   resplandor: '0 12px 28px -8px rgba(17,22,32,0.14)' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entrada: any = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

interface TarjetaKPIProps {
  rotulo: string;
  icono: IconComponent;
  tono?: TonoKPI;
  /** Cifra ya formateada. */
  cifra: React.ReactNode;
  /** Color de la cifra: `text-slate-900` o el semántico en tono 600–700. */
  cifraClassName?: string;
  descripcion?: React.ReactNode;
  /** Control pequeño junto al icono (p. ej. el engranaje de configuración). */
  accion?: React.ReactNode;
  /** Índice para el escalonado de la animación de entrada. */
  indice?: number;
  onClick?: () => void;
  /** Barra de progreso de 3px al pie de la tarjeta. */
  barra?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const TarjetaKPI: React.FC<TarjetaKPIProps> = ({
  rotulo, icono: Icono, tono = 'slate', cifra, cifraClassName = 'text-slate-900',
  descripcion, accion, indice = 0, onClick, barra, children, className = '',
}) => {
  const t = TONOS[tono];
  return (
    <motion.div
      custom={indice} variants={entrada} initial="hidden" animate="visible"
      whileHover={{ y: -2, boxShadow: t.resplandor }}
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-2xl shadow-card p-5 flex flex-col relative overflow-hidden min-w-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Rótulo + icono: altura mínima de dos renglones para alinear las cifras */}
      <div className="flex items-start justify-between gap-3 min-h-[36px]">
        <p className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide leading-[18px] min-w-0">
          {rotulo}
          {accion && <span className="inline-flex align-middle ml-1 -my-1">{accion}</span>}
        </p>
        <div className="flex items-center shrink-0">
          <span className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center ${t.fondo}`}>
            <Icono weight="duotone" className={`w-5 h-5 ${t.icono}`} />
          </span>
        </div>
      </div>

      <p className={`mt-3 text-[26px] sm:text-[30px] leading-none font-extrabold tracking-tight tabular-nums whitespace-nowrap ${cifraClassName}`}>
        {cifra}
      </p>

      {descripcion && (
        <p className="mt-2 text-[12px] text-slate-700 font-normal leading-snug">{descripcion}</p>
      )}

      {children}
      {barra}
    </motion.div>
  );
};

export default TarjetaKPI;
