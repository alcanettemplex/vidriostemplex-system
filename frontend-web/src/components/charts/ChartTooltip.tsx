import React from 'react';

/**
 * Tooltip único para Recharts (`<Tooltip content={<ChartTooltip … />} />`).
 * El valor va en tinta, nunca en el color de la serie: el cuadrito de color al lado
 * es el que lleva la identidad.
 */
interface EntradaTooltip {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  stroke?: string;
  fill?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: EntradaTooltip[];
  label?: string | number;
  /** Nombre visible por dataKey; si falta, se usa `name`. */
  nombres?: Record<string, string>;
  /** Formato del valor; recibe el dataKey para formatear distinto cada serie. */
  formato?: (valor: number, dataKey: string) => string;
  /** Texto del encabezado (por defecto, la etiqueta del eje X). */
  titulo?: (label: string | number | undefined) => React.ReactNode;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label, nombres, formato, titulo }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[12px] shadow-float min-w-[170px]">
      <p className="text-slate-900 mb-1.5 font-semibold">{titulo ? titulo(label) : label}</p>
      {payload.map((p, i) => {
        const clave = String(p.dataKey ?? p.name ?? i);
        const valor = typeof p.value === 'number' && formato ? formato(p.value, clave) : p.value;
        return (
          <p key={clave} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-800">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color || p.stroke || p.fill }} />
              {nombres?.[clave] ?? p.name}
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">{valor}</span>
          </p>
        );
      })}
    </div>
  );
};

export default ChartTooltip;
