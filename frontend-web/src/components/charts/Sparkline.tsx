import React from 'react';
import { TINTA } from './vizTokens';

/**
 * Mini línea de tendencia para acompañar una cifra (precio, KPI). Línea de 2px en tinta
 * secundaria; solo el último punto lleva color, porque es el dato que importa.
 * Con menos de 2 puntos no dibuja nada.
 */
interface SparklineProps {
  valores: number[];
  ancho?: number;
  alto?: number;
  /** Color del punto final (por defecto, azul Templex). */
  colorFinal?: string;
  titulo?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ valores, ancho = 72, alto = 22, colorFinal = '#1f5ad6', titulo }) => {
  if (valores.length < 2) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const pad = 3;
  const pts = valores.map((v, i) => {
    const x = pad + (i / (valores.length - 1)) * (ancho - pad * 2);
    // Serie plana: línea centrada, no pegada al piso.
    const y = max === min ? alto / 2 : pad + (1 - (v - min) / rango) * (alto - pad * 2);
    return [x, y] as const;
  });
  const [xf, yf] = pts[pts.length - 1];
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo} className="overflow-visible shrink-0">
      {titulo && <title>{titulo}</title>}
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none"
        stroke={TINTA.eje} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xf} cy={yf} r={3.5} fill={colorFinal} stroke={TINTA.superficie} strokeWidth={2} />
    </svg>
  );
};

export default Sparkline;
