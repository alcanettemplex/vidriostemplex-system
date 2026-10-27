import type { BordeId, Boquete, EsquinaId, MediaPerforacion, Perforacion, Pieza, TratamientoEsquina } from './tipos';

export interface Pt {
  x: number;
  y: number;
}
/** Vértice del contorno; `r` > 0 lo redondea con ese radio. `arco` > 0: se llega a él desde el
 *  vértice anterior por un semicírculo de ese radio, hacia adentro del vidrio (media perforación). */
export interface Vert extends Pt {
  r?: number;
  arco?: number;
  /** Se llega a él desde el vértice anterior por un arco de circunferencia de centro `c`, en sentido
   *  horario (visto en el plano) o antihorario. Alivios de boquete y contorno en arco. */
  circ?: ArcoCirc;
}
export interface ArcoCirc {
  c: Pt;
  r: number;
  horario: boolean;
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
/** Esquinas en que empieza y termina cada borde, en el recorrido horario del contorno. */
export const EXTREMOS: Record<BordeId, [EsquinaId, EsquinaId]> = {
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

// ── Contorno en arco ─────────────────────────────────────────────────────────

/** Canto curvo de un contorno en arco; null en las demás formas. */
export const bordeCurvo = (p: Pieza): BordeId | null => (p.contorno.tipo === 'arco' ? p.contorno.lado : null);

/** Radio del arco: la mitad del canto curvo. */
export function radioArco(p: Pieza): number {
  const b = bordeCurvo(p);
  if (!b) return 0;
  return (esHorizontal(b) ? p.ancho : p.alto) / 2;
}

export const esCirculo = (p: Pieza) => p.contorno.tipo === 'circulo';

/** Tratamientos de esquina que valen: las dos esquinas del canto curvo las reemplaza el arco, y en
 *  un círculo no hay esquinas. */
export function esquinasDe(p: Pieza): Record<EsquinaId, TratamientoEsquina> {
  if (esCirculo(p)) return { si: { tipo: 'recta' }, sd: { tipo: 'recta' }, id: { tipo: 'recta' }, ii: { tipo: 'recta' } };
  const b = bordeCurvo(p);
  if (!b) return p.esquinas;
  const [e1, e2] = EXTREMOS[b];
  return { ...p.esquinas, [e1]: { tipo: 'recta' }, [e2]: { tipo: 'recta' } };
}

/** Ángulo recorrido de `desde` a `hasta` alrededor de `a.c`, con signo (+ = horario en el plano). */
export function barridoArco(desde: Pt, a: ArcoCirc, hasta: Pt): number {
  const a0 = Math.atan2(desde.y - a.c.y, desde.x - a.c.x);
  const a1 = Math.atan2(hasta.y - a.c.y, hasta.x - a.c.x);
  let d = a1 - a0;
  if (a.horario) while (d <= 1e-9) d += 2 * Math.PI;
  else while (d >= -1e-9) d -= 2 * Math.PI;
  return d;
}

/** Puntos sobre el arco de `desde` a `hasta` (sin `desde`, con `hasta`), uno cada `paso` radianes. */
export function puntosSobreArco(desde: Pt, a: ArcoCirc, hasta: Pt, paso = Math.PI / 16): Pt[] {
  const d = barridoArco(desde, a, hasta);
  const a0 = Math.atan2(desde.y - a.c.y, desde.x - a.c.x);
  const n = Math.max(2, Math.ceil(Math.abs(d) / paso));
  const out: Pt[] = [];
  for (let k = 1; k < n; k++) {
    const th = a0 + (d * k) / n;
    out.push({ x: a.c.x + a.r * Math.cos(th), y: a.c.y + a.r * Math.sin(th) });
  }
  out.push(hasta);
  return out;
}

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

/** Punto del canto desde donde se mide `pos` del boquete o de la media perforación. */
export function origenBoquete(b: Pick<Boquete, 'borde' | 'desde'>, borde: Borde): Pt {
  const desdeS = (b.borde === 'sup' || b.borde === 'der') !== (b.desde === 'fin');
  return desdeS ? borde.S : borde.T;
}

/** Media perforación: centro `C` sobre el canto y tramo [t1, t2] que ocupa, medido desde S. */
export function geometriaMediaPerforacion(o: MediaPerforacion, borde: Borde) {
  const desdeS = (o.borde === 'sup' || o.borde === 'der') !== (o.desde === 'fin');
  const t = desdeS ? o.pos : borde.L - o.pos;
  const r = o.d > 0 ? o.d / 2 : 0;
  const t1 = t - r;
  const t2 = t + r;
  return { C: add(borde.S, mul(borde.d, t)), A: add(borde.S, mul(borde.d, t1)), D: add(borde.S, mul(borde.d, t2)), r, t1, t2 };
}

export function geometriaBoquete(b: Boquete, borde: Borde) {
  const [t1, t2] = tramoBoquete(b, borde);
  const A = add(borde.S, mul(borde.d, t1));
  const D = add(borde.S, mul(borde.d, t2));
  return { A, B: add(A, mul(borde.n, b.prof)), C: add(D, mul(borde.n, b.prof)), D, t1, t2 };
}

export type ProblemaAlivio = 'faltan-medidas' | 'corta-canto' | 'no-toca' | 'se-juntan';

/**
 * Alivios de un boquete: un círculo de Ø `d` en cada lado, con el centro sobre el lado a
 * `fondo − d/2` del canto. Devuelve el tramo del contorno de A a D que reemplaza al boquete, o el
 * problema por el que no se puede dibujar (entonces el boquete se dibuja sin alivios).
 * - fondo ≤ prof: cada círculo vuelve al mismo lado del boquete.
 * - fondo > prof (el caso del taller: 38 de boquete y alivio hasta 40): el círculo pasa el fondo y
 *   el arco termina sobre él.
 */
export function geometriaAlivios(b: Boquete, borde: Borde): { pts: Vert[]; r: number; centros: [Pt, Pt] } | { problema: ProblemaAlivio } | null {
  if (!b.alivio) return null;
  const { d: diam, fondo } = b.alivio;
  if (!(diam > 0) || !(fondo > 0) || !(b.prof > 0) || !(b.largo > 0)) return { problema: 'faltan-medidas' };
  const r = diam / 2;
  const c = fondo - r;
  if (c - r < -0.01) return { problema: 'corta-canto' };
  if (c - r >= b.prof - 0.01) return { problema: 'no-toca' };
  const g = geometriaBoquete(b, borde);
  const { d, n } = borde;
  const C1 = add(g.A, mul(n, c));
  const C2 = add(g.D, mul(n, c));
  const arco = (C: Pt): ArcoCirc => ({ c: C, r, horario: false });
  const ini1 = add(g.A, mul(n, c - r));
  const ini2 = add(g.D, mul(n, c - r));
  if (fondo <= b.prof + 0.01) {
    return {
      r,
      centros: [C1, C2],
      pts: [g.A, ini1, { ...add(g.A, mul(n, fondo)), circ: arco(C1) }, g.B, g.C, add(g.D, mul(n, fondo)), { ...ini2, circ: arco(C2) }, g.D],
    };
  }
  const s = Math.sqrt(Math.max(r * r - (b.prof - c) ** 2, 0));
  if (2 * s >= b.largo - 0.01) return { problema: 'se-juntan' };
  const E1 = add(g.B, mul(d, s));
  const E2 = add(g.C, mul(d, -s));
  return { r, centros: [C1, C2], pts: [g.A, ini1, { ...E1, circ: arco(C1) }, E2, { ...ini2, circ: arco(C2) }, g.D] };
}

/** Recortes de un canto (boquetes y medias perforaciones), en el orden en que se recorren. */
function puntosBoquetes(bid: BordeId, borde: Borde, p: Pieza): Vert[] {
  const lista: { t1: number; pts: Vert[] }[] = [];
  // El canto curvo de un arco no lleva recortes (la validación lo marca como error).
  if (bid === bordeCurvo(p)) return [];
  for (const o of p.operaciones) {
    if (o.tipo === 'boquete' && o.borde === bid) {
      const al = geometriaAlivios(o, borde);
      if (al && 'pts' in al) {
        lista.push({ t1: geometriaBoquete(o, borde).t1, pts: al.pts });
        continue;
      }
      const g = geometriaBoquete(o, borde);
      const r = o.radio > 0 ? o.radio : undefined;
      lista.push({ t1: g.t1, pts: [g.A, { ...g.B, r }, { ...g.C, r }, g.D] });
    } else if (o.tipo === 'media-perforacion' && o.borde === bid) {
      const g = geometriaMediaPerforacion(o, borde);
      if (g.r > 0) lista.push({ t1: g.t1, pts: [g.A, { ...g.D, arco: g.r }] });
    }
  }
  return lista.sort((x, y) => x.t1 - y.t1).flatMap((x) => x.pts);
}

/** Contorno completo del vidrio (esquinas tratadas + boquetes + medias perforaciones), en sentido horario. */
export function contornoDe(p: Pieza): Vert[] {
  // Círculo: de arriba a abajo y de vuelta por dos semicírculos (horario). Los vértices base
  // siguen siendo el cuadrado que lo envuelve: de ahí salen ANCHO, ALTO, m² y las perforaciones.
  if (esCirculo(p)) {
    const c = { x: p.ancho / 2, y: p.alto / 2 };
    const r = p.ancho / 2;
    return [
      { x: c.x, y: c.y - r },
      { x: c.x, y: c.y + r, circ: { c, r, horario: true } },
      { x: c.x, y: c.y - r, circ: { c, r, horario: true } },
    ];
  }
  const v = verticesBase(p);
  const bs = bordesDe(v);
  const esquinas = esquinasDe(p);
  const curvo = bordeCurvo(p);
  // Arco: la esquina donde empieza el canto curvo se corre `r` hacia adentro sobre el canto
  // anterior, y a la esquina donde termina se llega por el semicírculo (hacia afuera, horario).
  const arco = curvo ? (() => {
    const b = bs[curvo];
    const r = radioArco(p);
    return { ini: EXTREMOS[curvo][0], fin: EXTREMOS[curvo][1], P1: add(b.S, mul(b.n, r)), P2: add(b.T, mul(b.n, r)), c: add(mul(add(b.S, b.T), 0.5), mul(b.n, r)), r };
  })() : null;
  const out: Vert[] = [];
  for (const e of ORDEN_ESQUINAS) {
    if (arco && e === arco.ini) out.push(arco.P1);
    else if (arco && e === arco.fin) out.push({ ...arco.P2, circ: { c: arco.c, r: arco.r, horario: true } });
    else out.push(...puntosEsquina(e, v, bs, esquinas[e]));
    out.push(...puntosBoquetes(BORDE_SALIDA[e], bs[BORDE_SALIDA[e]], p));
  }
  // Un trazo no puede empezar por un arco (se llega a él desde el vértice anterior).
  if (out[0]?.circ) out.push(out.shift()!);
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
    if (P.circ && i > 0) {
      const barrido = barridoArco(prev, P.circ, P);
      const grande = Math.abs(barrido) > Math.PI + 1e-6 ? 1 : 0;
      segs.push(`A${f2(P.circ.r)} ${f2(P.circ.r)} 0 ${grande} ${P.circ.horario ? 1 : 0} ${f2(P.x)} ${f2(P.y)}`);
      continue;
    }
    // Semicírculo hacia adentro: con el contorno en sentido horario (Y hacia abajo), barrido 0.
    if (P.arco && P.arco > 0 && i > 0) {
      segs.push(`A${f2(P.arco)} ${f2(P.arco)} 0 0 0 ${f2(P.x)} ${f2(P.y)}`);
      continue;
    }
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

/**
 * Ancho y alto del rectángulo que envuelve el vidrio: lo que se imprime en ANCHO y ALTO y
 * con lo que se calcula el m². Una sola regla para las dos cosas: en un desplome que abre
 * arriba (`anchoSup` > `ancho`) el vidrio mide `anchoSup` de ancho, no `ancho`.
 */
export function medidasCaja(p: Pieza): { ancho: number; alto: number } {
  const caja = cajaDe(Object.values(verticesBase(p)));
  return { ancho: Math.round(caja.maxX - caja.minX), alto: Math.round(caja.maxY - caja.minY) };
}

/** Cantidades por unidad, con las mismas columnas de la orden de pedido del proveedor. */
export function conteosDe(p: Pieza): Conteos {
  const tratadas = esquinasDe(p);
  const esq = ORDEN_ESQUINAS.map((e) => tratadas[e]);
  const bs = bordesDe(verticesBase(p));
  const caja = medidasCaja(p);
  const curvo = bordeCurvo(p);
  // El canto curvo mide medio perímetro de su círculo, no la cuerda.
  const largoCanto = (b: BordeId) => (b === curvo ? Math.PI * radioArco(p) : bs[b].L);
  return {
    perf: p.operaciones.filter((o) => o.tipo === 'perforacion' || o.tipo === 'media-perforacion').length,
    boq: p.operaciones.filter((o) => o.tipo === 'boquete').length + esq.filter((e) => e.tipo === 'muesca').length,
    dsp: esq.filter((e) => e.tipo === 'despunte').length,
    // El arco cuenta como un radio (decisión del usuario, 2026-10-20).
    // El círculo, como un diámetro: 2 radios (decisión del usuario, 2026-10-27).
    radios: esCirculo(p) ? 2 : esq.filter((e) => e.tipo === 'radio').length + (curvo ? 1 : 0),
    chaflanMl: p.operaciones.reduce((s, o) => (o.tipo === 'chaflan' ? s + largoCanto(o.borde) / 1000 : s), 0),
    m2: (caja.ancho * caja.alto) / 1e6,
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
