import React from 'react';
import { motion } from 'framer-motion';
import { TINTA } from './vizTokens';

/**
 * Barras hechas en HTML para rankings, embudos, repartos y avances. Van aquí y no en Recharts
 * porque son filas con rótulo y cifra, que se leen mejor como lista que como eje.
 *
 * Reglas del kit: barra fina, punta de 4px, pista tenue, el valor en tinta (nunca en el color
 * de la barra) y 2px de superficie entre segmentos de una barra apilada.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── BarraMagnitud: una fila de ranking o embudo ────────────────────────────────
interface BarraMagnitudProps {
  label: React.ReactNode;
  /** Texto secundario bajo el rótulo. */
  detalle?: React.ReactNode;
  valor: number;
  max: number;
  color: string;
  /** Cifra a la derecha, ya formateada. Por defecto, el valor. */
  cifra?: React.ReactNode;
  /** Segunda cifra, atenuada (p. ej. el % del total). */
  cifraSecundaria?: React.ReactNode;
  /** Ancho del rótulo (Tailwind). */
  anchoLabel?: string;
  /** Sangría para sub-etapas de un embudo. */
  sub?: boolean;
  alto?: 'fina' | 'media';
  indice?: number;
  onClick?: () => void;
}

export const BarraMagnitud: React.FC<BarraMagnitudProps> = ({
  label, detalle, valor, max, color, cifra, cifraSecundaria, anchoLabel = 'w-32', sub = false,
  alto = 'media', indice = 0, onClick,
}) => {
  const pct = max > 0 ? Math.max((valor / max) * 100, valor > 0 ? 1.5 : 0) : 0;
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick}
      className={`w-full flex items-center gap-3 text-left ${sub ? 'pl-4' : ''} ${onClick ? 'rounded-lg -mx-1 px-1 py-0.5 hover:bg-slate-50 transition-colors' : ''}`}>
      <div className={`${anchoLabel} shrink-0 min-w-0`}>
        <p className={`text-[12px] truncate ${sub ? 'text-slate-700' : 'text-slate-900'}`}>{label}</p>
        {detalle && <p className="text-[11px] text-slate-700 truncate">{detalle}</p>}
      </div>
      <div className={`flex-1 min-w-0 rounded-full overflow-hidden ${alto === 'fina' ? 'h-1.5' : 'h-2.5'}`} style={{ background: TINTA.pista }}>
        <motion.div className="h-full rounded-full" style={{ background: color }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.05 + indice * 0.04 }} />
      </div>
      <div className="shrink-0 text-right min-w-[3rem]">
        <p className="text-[12px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{cifra ?? valor}</p>
        {cifraSecundaria !== undefined && <p className="text-[11px] text-slate-700 tabular-nums whitespace-nowrap">{cifraSecundaria}</p>}
      </div>
    </Comp>
  );
};

// ─── BarraApilada: reparto de un total (reemplaza a los donuts) ─────────────────
export interface SegmentoApilado {
  clave: string;
  label: string;
  valor: number;
  color: string;
  /** Cifra formateada para la leyenda; por defecto, el valor. */
  cifra?: React.ReactNode;
}

interface BarraApiladaProps {
  segmentos: SegmentoApilado[];
  /** Muestra la lista de segmentos con cifra y % bajo la barra. */
  conLeyenda?: boolean;
  /** Total contra el que se calcula el %; por defecto, la suma de los segmentos. */
  total?: number;
  /** Columna de % en la leyenda; apagarla cuando `cifra` ya es un porcentaje. */
  mostrarPct?: boolean;
  alto?: number;
}

/**
 * Un donut obliga a comparar ángulos, y con valores cercanos (28% vs 25%) nadie los distingue.
 * Una barra apilada con la lista debajo da el reparto de un vistazo y la cifra exacta.
 */
export const BarraApilada: React.FC<BarraApiladaProps> = ({ segmentos, conLeyenda = true, total, mostrarPct = true, alto = 12 }) => {
  const suma = total ?? segmentos.reduce((s, x) => s + x.valor, 0);
  const visibles = segmentos.filter(s => s.valor > 0);
  if (suma <= 0) {
    return <div className="rounded-full" style={{ height: alto, background: TINTA.pista }} />;
  }
  return (
    <div>
      <div className="flex w-full gap-[2px] rounded-full overflow-hidden" style={{ height: alto, background: TINTA.pista }}>
        {visibles.map((s, i) => (
          <motion.div key={s.clave} title={`${s.label}: ${Math.round((s.valor / suma) * 100)}%`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: s.color }}
            initial={{ width: 0 }} animate={{ width: `${(s.valor / suma) * 100}%` }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.05 + i * 0.05 }} />
        ))}
      </div>
      {conLeyenda && (
        <ul className="mt-3 space-y-1.5">
          {segmentos.map(s => (
            <li key={s.clave} className="flex items-center gap-2 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="flex-1 text-slate-800 truncate">{s.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{s.cifra ?? s.valor}</span>
              {mostrarPct && <span className="w-10 text-right text-slate-700 tabular-nums">{Math.round((s.valor / suma) * 100)}%</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── Medidor: avance contra una meta ────────────────────────────────────────────
interface MedidorProps {
  /** 0–100+; se recorta a 100 para dibujar, el texto muestra el real. */
  pct: number;
  color?: string;
  alto?: number;
  className?: string;
  /** Referencia en la misma escala 0–100 (p. ej. el promedio del equipo): una línea vertical. */
  marca?: number;
  marcaTitulo?: string;
}

export const Medidor: React.FC<MedidorProps> = ({ pct, color = '#1f5ad6', alto = 8, className = '', marca, marcaTitulo }) => (
  <div className={`relative w-full ${className}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
    <div className="w-full rounded-full overflow-hidden" style={{ height: alto, background: TINTA.pista }}>
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} />
    </div>
    {marca !== undefined && (
      <span title={marcaTitulo} className="absolute top-1/2 -translate-y-1/2 w-[2px] rounded-full"
        style={{ left: `calc(${Math.min(Math.max(marca, 0), 100)}% - 1px)`, height: alto + 6, background: TINTA.primaria }} />
    )}
  </div>
);
