import type { ReactNode } from 'react';
import { add, largo, mul, sub, unit, type Pt } from '../modelo/geometria';

// Primitivas de cotas compartidas por el plano principal y sus detalles ampliados (2026-10-29).

// Estilo «calco del taller» (propuesta 6, 2026-10-27): vidrio en blanco, todo en tinta negra, remates
// rectos y ANCHO / ALTO en negrita y más grandes, como el plano que dibuja el taller a mano. El azul
// (ACENTO) queda solo para la selección del editor: la imagen que se exporta no lo lleva.
export const TINTA = '#111';
export const COTA = '#111';
export const VIDRIO = '#fff';
export const ACENTO = '#1565c0';
export const SUAVE = '#6b7280';

export const fmt = (n: number) => String(Math.round(n * 10) / 10);
/** Ancho aproximado que ocupa un texto de cota (Arial), en las mismas unidades que `f`. */
export const anchoTexto = (texto: string, f: number) => texto.length * f * 0.6 + f * 0.5;

export interface CotaProps {
  a: Pt;
  b: Pt;
  texto: string;
  f: number;
  /** 1 o -1: de qué lado de la línea va el texto (según la normal izquierda de a→b). */
  lado?: number;
  color?: string;
  /**
   * Dónde va el texto a lo largo de la cota (0 = en `a`, 1 = en `b`). Fuera de [0, 1] el texto queda
   * desplazado y la línea se prolonga hasta él, como se hace con las cotas muy cortas en un plano.
   */
  t?: number;
  /** Número en negrita (cotas generales). */
  bold?: boolean;
  /** Número siempre horizontal, al costado de la línea (cadenas verticales del calco del taller). */
  horizontal?: boolean;
}

/** Rectángulo alineado a los ejes, en unidades del plano. */
export interface Caja {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** ¿El segmento a–b pasa por la caja? (Liang–Barsky) */
export function cruzaCaja(a: Pt, b: Pt, c: Caja): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - c.x1, c.x2 - a.x, a.y - c.y1, c.y2 - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/**
 * Espacio ocupado del plano (2026-10-23): cada texto que se dibuja anota su caja, y las líneas que un
 * número no debe tapar (borde del vidrio, líneas de cota y auxiliares) se anotan como segmentos. Un
 * texto nuevo prueba sus posiciones en orden y toma la primera libre. Lo que se anota primero
 * manda: por eso las cotas generales se ubican antes que las de herrajes y estas antes que las muescas.
 */
export function crearColocador() {
  const cajas: Caja[] = [];
  const lineas: [Pt, Pt][] = [];
  return {
    libre: (c: Caja) => cajas.every((o) => c.x2 <= o.x1 || c.x1 >= o.x2 || c.y2 <= o.y1 || c.y1 >= o.y2) && lineas.every(([a, b]) => !cruzaCaja(a, b, c)),
    ocupar: (c: Caja) => void cajas.push(c),
    linea: (a: Pt, b: Pt) => void lineas.push([a, b]),
    /** ¿El segmento a–b pasa por encima de algún texto ya ubicado? */
    tapaTexto: (a: Pt, b: Pt) => cajas.some((c) => cruzaCaja(a, b, c)),
  };
}
export type Colocador = ReturnType<typeof crearColocador>;

/** Caja de un texto de ancho `w` y alto `h` centrado en `p` y girado `ang` grados. */
export function cajaTexto(p: Pt, w: number, h: number, ang = 0): Caja {
  const r = (ang * Math.PI) / 180;
  const ex = (Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * h) / 2;
  const ey = (Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * h) / 2;
  return { x1: p.x - ex, y1: p.y - ey, x2: p.x + ex, y2: p.y + ey };
}

/** Caja de un `<Texto>` según su `anchor`. */
export function cajaEtiqueta(p: Pt, texto: string, f: number, anchor: 'start' | 'middle' | 'end' = 'middle'): Caja {
  const w = anchoTexto(texto, f);
  const cx = anchor === 'start' ? p.x + w / 2 - f * 0.25 : anchor === 'end' ? p.x - w / 2 + f * 0.25 : p.x;
  return cajaTexto({ x: cx, y: p.y }, w, f);
}

export interface Colocacion {
  tp: Pt;
  ang: number;
  /** Tramo que prolonga la línea de cota hasta el texto, si el texto quedó fuera de ella. */
  prolongacion: [Pt, Pt] | null;
  caja: Caja;
}

/**
 * Dónde va el número de una cota. Si cabe entre las marcas: en su sitio (centro o `t`) del lado
 * pedido, o del otro lado. Si no cabe —el 35 de una muesca 150×35 en una puerta de 2 m— o esos
 * sitios están tapados: fuera de la línea, pasado un extremo (primero el que se aleja del vidrio) y
 * **horizontal**, como en los planos del taller. Si nada está libre, el primer candidato.
 */
export function colocarCota(col: Colocador, { a, b, texto, f, lado = 1, t = 0.5, bold, horizontal }: CotaProps, centro: Pt): Colocacion | null {
  const L = largo(sub(b, a));
  if (L < 1e-6) return null;
  const d = unit(sub(b, a));
  const n = { x: -d.y, y: d.x };
  let angLinea = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (angLinea > 90.1) angLinea -= 180;
  if (angLinea <= -90.1) angLinea += 180;
  if (horizontal) angLinea = 0;
  const w = anchoTexto(texto, f) * (bold ? 1.1 : 1);
  const h = f;
  // Cabe si la línea es al menos tan larga como las cifras (sin el margen que lleva `anchoTexto`).
  const cabe = horizontal ? L >= (Math.abs(d.x) * texto.length * f * 0.55 + Math.abs(d.y) * f) + f * 0.1 : L >= texto.length * f * 0.55 + f * 0.1;
  const candidatos: Colocacion[] = [];
  const enLinea = (tt: number, ld: number) => {
    const base = add(a, mul(d, L * tt));
    // Horizontal junto a una línea vertical: se separa la mitad de su ancho, no de su alto.
    const sep = horizontal ? (Math.abs(n.x) * anchoTexto(texto, f)) / 2 + Math.abs(n.y) * f * 0.5 + f * 0.25 : f * 0.75;
    const tp = add(base, mul(n, ld * sep));
    const prolongacion: [Pt, Pt] | null = tt < 0 ? [base, a] : tt > 1 ? [b, base] : null;
    candidatos.push({ tp, ang: angLinea, prolongacion, caja: cajaTexto(tp, w, h, angLinea) });
  };
  if (cabe || t < 0 || t > 1) {
    enLinea(t, lado);
    enLinea(t, -lado);
  }
  // Pasado un extremo, horizontal y sobre el eje de la línea; después, corrido a cada lado.
  const extension = (Math.abs(d.x) * w + Math.abs(d.y) * h) / 2;
  const dist = (p: Pt) => largo(sub(p, centro));
  const extremos: [Pt, Pt][] = [
    [b, d],
    [a, mul(d, -1)],
  ];
  if (dist(a) > dist(b)) extremos.reverse();
  for (const lat of [0, lado, -lado]) {
    for (const [E, dir] of extremos) {
      const tp = add(add(E, mul(dir, f * 0.45 + extension)), mul(n, lat * (Math.abs(d.x) * h + Math.abs(d.y) * w) * 0.6));
      candidatos.push({ tp, ang: 0, prolongacion: lat === 0 ? [E, add(E, mul(dir, f * 0.35))] : null, caja: cajaTexto(tp, w, h) });
    }
  }
  if (!cabe) enLinea(0.5, lado);
  const elegido = candidatos.find((c) => col.libre(c.caja)) ?? candidatos[0];
  col.ocupar(elegido.caja);
  col.linea(a, b);
  return elegido;
}

/** Línea de cota con remates rectos (perpendiculares) en los extremos y el valor, ya colocado. */
export function DibujoCota({ a, b, texto, f, color = COTA, bold, c }: Pick<CotaProps, 'a' | 'b' | 'texto' | 'f' | 'color' | 'bold'> & { c: Colocacion }) {
  const d = unit(sub(b, a));
  const n = { x: -d.y, y: d.x };
  const tick = mul(n, f * 0.4);
  return (
    <g stroke={color} fill={color}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {c.prolongacion && (
        <line x1={c.prolongacion[0].x} y1={c.prolongacion[0].y} x2={c.prolongacion[1].x} y2={c.prolongacion[1].y} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      )}
      {[a, b].map((p, i) => (
        <line key={i} x1={p.x - tick.x} y1={p.y - tick.y} x2={p.x + tick.x} y2={p.y + tick.y} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      ))}
      <text x={c.tp.x} y={c.tp.y} fontSize={f} fontWeight={bold ? 700 : 400} stroke="none" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, sans-serif" transform={c.ang ? `rotate(${c.ang} ${c.tp.x} ${c.tp.y})` : undefined}>
        {texto}
      </text>
    </g>
  );
}

export function Texto({ p, children, f, anchor = 'middle', bold, color = TINTA }: { p: Pt; children: ReactNode; f: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; color?: string }) {
  return (
    <text x={p.x} y={p.y} fontSize={f} fill={color} textAnchor={anchor} dominantBaseline="central" fontFamily="Arial, sans-serif" fontWeight={bold ? 700 : 400}>
      {children}
    </text>
  );
}

/** Valor de `lado` (de `CotaProps`) que deja el número de la cota a→b del lado hacia el que apunta `dir`. */
export function ladoHacia(a: Pt, b: Pt, dir: Pt): number {
  const d = unit(sub(b, a));
  return -d.y * dir.x + d.x * dir.y >= 0 ? 1 : -1;
}
