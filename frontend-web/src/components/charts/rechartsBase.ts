import { TINTA } from './vizTokens';

/**
 * Configuración común de Recharts: ejes y rejilla recesivos, para que el dato mande.
 * Rejilla en línea fina y SÓLIDA (una rejilla punteada se lee como "proyección" o "umbral"),
 * sin líneas de eje ni marcas; rótulos de eje en 11px, el mínimo del ERP.
 */
export const ejeX = {
  axisLine: { stroke: TINTA.base },
  tickLine: false,
  tick: { fill: TINTA.eje, fontSize: 11 },
  tickMargin: 8,
} as const;

export const ejeY = {
  axisLine: false,
  tickLine: false,
  tick: { fill: TINTA.eje, fontSize: 11 },
  tickMargin: 4,
} as const;

export const rejilla = {
  vertical: false,
  stroke: TINTA.rejilla,
} as const;

/** Sombreado de la categoría bajo el cursor (barras). */
export const cursorBarra = { fill: '#f6f7f9' } as const;

/** Guía vertical bajo el cursor (líneas). */
export const cursorLinea = { stroke: TINTA.base, strokeWidth: 1 } as const;

/** Punta redondeada de 4px anclada a la base (barras verticales / horizontales). */
export const puntaVertical: [number, number, number, number] = [4, 4, 0, 0];
export const puntaHorizontal: [number, number, number, number] = [0, 4, 4, 0];
