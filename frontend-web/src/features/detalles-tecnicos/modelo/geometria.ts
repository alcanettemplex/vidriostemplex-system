import type { BordeId, Boquete, EsquinaId, Perforacion, Pieza, TratamientoEsquina } from './tipos';

export interface Pt {
  x: number;
  y: number;
}
/** Vértice del contorno; `r` > 0 lo redondea con ese radio. */
export interface Vert extends Pt {
  r?: number;
}
export interface Borde {
  S: Pt;
  T: Pt;
  /** Dirección unitaria de S a T (recorrido horario). */
  d: Pt;
  /** Normal unitaria hacia el interior del vidrio. */
  n: Pt;
  L: number;
}

export const ORDEN_ESQUINAS: EsquinaId[] = ['si', 'sd', 'id', 'ii'];
export const BORDE_SALIDA: Record<EsquinaId, BordeId> = { si: 'sup', sd: 'der', id: 'inf', ii: 'izq' };
export const BORDE_ENTRADA: Record<EsquinaId, BordeId> = { si: 'izq', sd: 'sup', id: 'der', ii: 'inf' };
const EXTREMOS: Record<BordeId, [EsquinaId, EsquinaId]> = {
  sup: ['si', 'sd'],
  der: ['sd', 'id'],
  inf: ['id', 'ii'],
  izq: ['ii', 'si'],
};

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const largo = (a: Pt) => Math.hypot(a.x, a.y);
export const unit = (a: Pt): Pt => {
  const l = largo(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const esHorizontal = (b: BordeId) => b === 'sup' || b === 'inf';

/** Las 4 esquinas del vidrio sin tratamientos, desplazadas para que el mínimo quede en (0,0). */
export function verticesBase(p: Pieza): Record<EsquinaId, Pt> {
  const W = p.ancho;
  const H = p.alto;
  const c = p.contorno;
  const v: Record<EsquinaId, Pt> = { si: { x: 0, y: 0 }, sd: { x: W, y: 0 }, id: { x: W, y: H }, ii: { x: 0, y: H } };
  if (c.tipo === 'desplome-lateral') {
    if (c.lado === 'der') v.sd = { x: c.anchoSup, y: 0 };
    else v.si = { x: W - c.anchoSup, y: 0 };
  } else if (c.tipo === 'desplome-superior') {
    if (c.lado === 'der') v.sd = { x: W, y: H - c.altoLado };
    else v.si = { x: 0, y: H - c.altoLado };
  }
  const minX = Math.min(...ORDEN_ESQUINAS.map((k) => v[k].x));
  const minY = Math.min(...ORDEN_ESQUINAS.map((k) => v[k].y));
  for (const k of ORDEN_ESQUINAS) v[k] = { x: v[k].x - minX, y: v[k].y - minY };
  return v;
}

export function cajaDe(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function bordesDe(v: Record<EsquinaId, Pt>): Record<BordeId, Borde> {
  const mk = (b: BordeId): Borde => {
    const [s, t] = EXTREMOS[b];
    const S = v[s];
    const T = v[t];
    const d = unit(sub(T, S));
    return { S, T, d, n: { x: -d.y, y: d.x }, L: largo(sub(T, S)) };
  };
  return { sup: mk('sup'), der: mk('der'), inf: mk('inf'), izq: mk('izq') };
}

function puntosEsquina(id: EsquinaId, v: Record<EsquinaId, Pt>, bs: Record<BordeId, Borde>, t: TratamientoEsquina): Vert[] {
  const V = v[id];
  const bIn = BORDE_ENTRADA[id];
  const bOut = BORDE_SALIDA[id];
  switch (t.tipo) {
    case 'recta':
      return [V];
    case 'radio':
      return [{ ...V, r: t.r }];
    case 'despunte':
    case 'muesca': {
      const dIn = esHorizontal(bIn) ? t.a : t.b;
      const dOut = esHorizontal(bOut) ? t.a : t.b;
      const p1 = add(V, mul(bs[bIn].d, -dIn));
      const p3 = add(V, mul(bs[bOut].d, dOut));
      if (t.tipo === 'despunte') return [p1, p3];
      return [p1, add(p1, mul(bs[bOut].d, dOut)), p3];
    }
  }
}

/** Tramo [t1, t2] del boquete medido desde S del canto (recorrido horario). */
export function tramoBoquete(b: Boquete, borde: Borde): [number, number] {
  const desdeS = (b.borde === 'sup' || b.borde === 'der') !== (b.desde === 'fin');
  return desdeS ? [b.pos, b.pos + b.largo] : [borde.L - b.pos - b.largo, borde.L - b.pos];
}

/** Punto del canto desde donde se mide `pos` del boquete. */
export function origenBoquete(b: Boquete, borde: Borde): Pt {
  const desdeS = (b.borde === 'sup' || b.borde === 'der') !== (b.desde === 'fin');
  return desdeS ? borde.S : borde.T;
}

export function geometriaBoquete(b: Boquete, borde: Borde) {
  const [t1, t2] = tramoBoquete(b, borde);
  const A = add(borde.S, mul(borde.d, t1));
  const D = add(borde.S, mul(borde.d, t2));
  return { A, B: add(A, mul(borde.n, b.prof)), C: add(D, mul(borde.n, b.prof)), D, t1, t2 };
}

function puntosBoquetes(bid: BordeId, borde: Borde, p: Pieza): Vert[] {
  const lista = p.operaciones
    .filter((o): o is Boquete => o.tipo === 'boquete' && o.borde === bid)
    .map((b) => ({ b, g: geometriaBoquete(b, borde) }))
    .sort((x, y) => x.g.t1 - y.g.t1);
  const pts: Vert[] = [];
  for (const { b, g } of lista) {
    const r = b.radio > 0 ? b.radio : undefined;
    pts.push(g.A, { ...g.B, r }, { ...g.C, r }, g.D);
  }
  return pts;
}

/** Contorno completo del vidrio (esquinas tratadas + boquetes), en sentido horario. */
export function contornoDe(p: Pieza): Vert[] {
  const v = verticesBase(p);
  const bs = bordesDe(v);
  const out: Vert[] = [];
  for (const e of ORDEN_ESQUINAS) {
    out.push(...puntosEsquina(e, v, bs, p.esquinas[e]));
    out.push(...puntosBoquetes(BORDE_SALIDA[e], bs[BORDE_SALIDA[e]], p));
  }
  return out;
}

const f2 = (n: number) => +n.toFixed(2);

export function pathDe(pts: Vert[]): string {
  const n = pts.length;
  const segs: string[] = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const cmd = i === 0 ? 'M' : 'L';
    if (P.r && P.r > 0) {
      const r = Math.min(P.r, largo(sub(P, prev)) / 2, largo(sub(next, P)) / 2);
      if (r > 0.01) {
        const p1 = add(P, mul(unit(sub(prev, P)), r));
        const p2 = add(P, mul(unit(sub(next, P)), r));
        const a = sub(P, prev);
        const b = sub(next, P);
        const sweep = a.x * b.y - a.y * b.x > 0 ? 1 : 0;
        segs.push(`${cmd}${f2(p1.x)} ${f2(p1.y)} A${f2(r)} ${f2(r)} 0 0 ${sweep} ${f2(p2.x)} ${f2(p2.y)}`);
        continue;
      }
    }
    segs.push(`${cmd}${f2(P.x)} ${f2(P.y)}`);
  }
  return segs.join(' ') + ' Z';
}

function interpX(a: Pt, b: Pt, y: number) {
  if (Math.abs(b.y - a.y) < 1e-9) return a.x;
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}
function interpY(a: Pt, b: Pt, x: number) {
  if (Math.abs(b.x - a.x) < 1e-9) return a.y;
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

/** Posición de cada canto del vidrio base a una altura/abscisa dada (sirve para contornos inclinados). */
export function limitesDe(v: Record<EsquinaId, Pt>) {
  return {
    xIzq: (y: number) => interpX(v.ii, v.si, y),
    xDer: (y: number) => interpX(v.sd, v.id, y),
    ySup: (x: number) => interpY(v.si, v.sd, x),
    yInf: (x: number) => interpY(v.ii, v.id, x),
  };
}

export function centroPerforacion(p: Pieza, o: Perforacion, v = verticesBase(p)): Pt {
  const L = limitesDe(v);
  const calcX = (y: number) =>
    o.refX === 'izq' ? L.xIzq(y) + o.x : o.refX === 'der' ? L.xDer(y) - o.x : (L.xIzq(y) + L.xDer(y)) / 2 + o.x;
  const calcY = (x: number) =>
    o.refY === 'sup' ? L.ySup(x) + o.y : o.refY === 'inf' ? L.yInf(x) - o.y : (L.ySup(x) + L.yInf(x)) / 2 + o.y;
  let y = calcY(p.ancho / 2);
  let x = calcX(y);
  y = calcY(x);
  x = calcX(y);
  return { x, y };
}

export interface Conteos {
  perf: number;
  boq: number;
  dsp: number;
  radios: number;
  chaflanMl: number;
  m2: number;
}

/** Cantidades por unidad, con las mismas columnas de la orden de pedido del proveedor. */
export function conteosDe(p: Pieza): Conteos {
  const esq = ORDEN_ESQUINAS.map((e) => p.esquinas[e]);
  const bs = bordesDe(verticesBase(p));
  const caja = cajaDe(Object.values(verticesBase(p)));
  return {
    perf: p.operaciones.filter((o) => o.tipo === 'perforacion').length,
    boq: p.operaciones.filter((o) => o.tipo === 'boquete').length + esq.filter((e) => e.tipo === 'muesca').length,
    dsp: esq.filter((e) => e.tipo === 'despunte').length,
    radios: esq.filter((e) => e.tipo === 'radio').length,
    chaflanMl: p.operaciones.reduce((s, o) => (o.tipo === 'chaflan' ? s + bs[o.borde].L / 1000 : s), 0),
    m2: ((caja.maxX - caja.minX) * (caja.maxY - caja.minY)) / 1e6,
  };
}

/** "5+5" → 10; "8" → 8. */
export function espesorNumerico(e: string): number {
  return e
    .split('+')
    .map((s) => parseFloat(s.replace(',', '.')))
    .filter((n) => !isNaN(n))
    .reduce((a, b) => a + b, 0);
}

export const letraPlano = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : letraPlano(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));

/** Encuadre del dibujo: caja del vidrio, tamaño de letra y margen reservado para las cotas. */
export function encuadre(pieza: Pieza, conCotas = true) {
  const v = verticesBase(pieza);
  const caja = cajaDe(ORDEN_ESQUINAS.map((e) => v[e]));
  const W = caja.maxX - caja.minX;
  const H = caja.maxY - caja.minY;
  const m = Math.max(W, H, 1);
  const f = Math.min(Math.max(m * 0.024, 9), 70);
  const M = conCotas ? f * 6.4 : m * 0.05;
  return { v, caja, W, H, m, f, M, anchoTotal: W + 2 * M, altoTotal: H + 2 * M };
}
