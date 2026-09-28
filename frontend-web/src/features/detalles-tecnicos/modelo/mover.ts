// Reubicación de procesos a partir de una posición en el plano (arrastre con el mouse o flechas).
// Convierte la posición en milímetros a las medidas que se guardan: distancia al borde más cercano.

import { bordesDe, cajaDe, centroPerforacion, geometriaBoquete, largo, limitesDe, ORDEN_ESQUINAS, sub, unit, verticesBase, type Pt } from './geometria';
import type { BordeId, Boquete, EsquinaId, Nota, Operacion, Perforacion, Pieza } from './tipos';

const clamp = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(Math.max(v, min), max));
export const redondear = (v: number, paso: number) => Math.round(v / paso) * paso;
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Extremos de cada borde en su sentido «natural»: izquierda→derecha y arriba→abajo. */
const NATURAL: Record<BordeId, [EsquinaId, EsquinaId]> = { sup: ['si', 'sd'], der: ['sd', 'id'], inf: ['ii', 'id'], izq: ['si', 'ii'] };

function distanciaASegmento(p: Pt, a: Pt, b: Pt) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-9), 0, 1);
  return largo(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

/**
 * Perforación con su centro en `c`. Si `autoRef`, la medida pasa a tomarse desde el borde más
 * cercano (lo que espera quien la ubica a mano); las referidas al centro siguen al centro.
 */
export function reubicarPerforacion(p: Pieza, o: Perforacion, c: Pt, paso: number, autoRef = true): Perforacion {
  const L = limitesDe(verticesBase(p));
  const r = o.d / 2;
  let cy = clamp(c.y, L.ySup(c.x) + r, L.yInf(c.x) - r);
  const cx = clamp(c.x, L.xIzq(cy) + r, L.xDer(cy) - r);
  cy = clamp(c.y, L.ySup(cx) + r, L.yInf(cx) - r);
  const xi = L.xIzq(cy);
  const xd = L.xDer(cy);
  const ys = L.ySup(cx);
  const yi = L.yInf(cx);
  const refX = autoRef && o.refX !== 'centro' ? (cx - xi <= xd - cx ? 'izq' : 'der') : o.refX;
  const refY = autoRef && o.refY !== 'centro' ? (cy - ys <= yi - cy ? 'sup' : 'inf') : o.refY;
  const minBorde = Math.ceil(r);
  const x = refX === 'centro' ? redondear(cx - (xi + xd) / 2, paso) : Math.max(redondear(refX === 'izq' ? cx - xi : xd - cx, paso), minBorde);
  const y = refY === 'centro' ? redondear(cy - (ys + yi) / 2, paso) : Math.max(redondear(refY === 'sup' ? cy - ys : yi - cy, paso), minBorde);
  return { ...o, refX, refY, x, y };
}

/** Boquete con su centro lo más cerca posible de `c`. Puede saltar a otro borde si `cambiarBorde`. */
export function reubicarBoquete(p: Pieza, o: Boquete, c: Pt, paso: number, cambiarBorde = true): Boquete {
  const v = verticesBase(p);
  let borde = o.borde;
  if (cambiarBorde) {
    const bordes: BordeId[] = ['sup', 'der', 'inf', 'izq'];
    borde = bordes.reduce((mejor, b) => {
      const [a1, b1] = NATURAL[b];
      const [a2, b2] = NATURAL[mejor];
      return distanciaASegmento(c, v[a1], v[b1]) < distanciaASegmento(c, v[a2], v[b2]) ? b : mejor;
    }, borde);
  }
  const [ea, eb] = NATURAL[borde];
  const A = v[ea];
  const L = largo(sub(v[eb], A));
  const lb = Math.min(o.largo, L);
  const ini = clamp(dot(sub(c, A), unit(sub(v[eb], A))) - lb / 2, 0, L - lb);
  const desde = ini + lb / 2 <= L / 2 ? 'inicio' : 'fin';
  const pos = clamp(redondear(desde === 'inicio' ? ini : L - ini - lb, paso), 0, L - lb);
  return { ...o, borde, desde, pos };
}

export function reubicarNota(p: Pieza, o: Nota, c: Pt): Nota {
  const v = verticesBase(p);
  const k = cajaDe(ORDEN_ESQUINAS.map((e) => v[e]));
  const pct = (val: number, min: number, max: number) => Math.round(clamp(((val - min) / Math.max(max - min, 1)) * 100, 0, 100));
  return { ...o, x: pct(c.x, k.minX, k.maxX), y: pct(c.y, k.minY, k.maxY) };
}

/** Punto de agarre de cada proceso (el que se desplaza al arrastrar). */
export function puntoDe(p: Pieza, o: Operacion): Pt | null {
  const v = verticesBase(p);
  if (o.tipo === 'perforacion') return centroPerforacion(p, o, v);
  if (o.tipo === 'boquete') {
    const g = geometriaBoquete(o, bordesDe(v)[o.borde]);
    return { x: (g.A.x + g.D.x) / 2, y: (g.A.y + g.D.y) / 2 };
  }
  if (o.tipo === 'nota') {
    const k = cajaDe(ORDEN_ESQUINAS.map((e) => v[e]));
    return { x: k.minX + ((k.maxX - k.minX) * o.x) / 100, y: k.minY + ((k.maxY - k.minY) * o.y) / 100 };
  }
  return null;
}

/**
 * Desplaza `ids` en `delta` milímetros partiendo de su estado en `original` (así un arrastre largo no
 * acumula redondeos). En grupo, los boquetes se quedan en su borde.
 */
export function moverOperaciones(actual: Pieza, original: Pieza, ids: string[], delta: Pt, paso: number): Pieza {
  const enGrupo = ids.length > 1;
  const nuevas = new Map<string, Operacion>();
  for (const id of ids) {
    const o = original.operaciones.find((x) => x.id === id);
    const p0 = o && puntoDe(original, o);
    if (!o || !p0) continue;
    const destino = { x: p0.x + delta.x, y: p0.y + delta.y };
    if (o.tipo === 'perforacion') nuevas.set(id, reubicarPerforacion(actual, o, destino, paso));
    if (o.tipo === 'boquete') nuevas.set(id, reubicarBoquete(actual, o, destino, paso, !enGrupo));
    if (o.tipo === 'nota') nuevas.set(id, reubicarNota(actual, o, destino));
  }
  return { ...actual, operaciones: actual.operaciones.map((o) => nuevas.get(o.id) ?? o) };
}

/** Ids que se mueven juntos con `id` (todo su herraje), salvo que se pida moverlo solo. */
export function idsDelGrupo(p: Pieza, id: string, solo = false): string[] {
  const o = p.operaciones.find((x) => x.id === id);
  if (!o || !o.grupo || solo) return [id];
  return p.operaciones.filter((x) => x.grupo?.id === o.grupo!.id).map((x) => x.id);
}
