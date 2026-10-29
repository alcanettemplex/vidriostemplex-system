import {
  add,
  bordeCurvo,
  bordesDe,
  cajaDe,
  centroPerforacion,
  encuadre,
  esCirculo,
  esquinasDe,
  geometriaAlivios,
  geometriaBoquete,
  geometriaMediaPerforacion,
  geometriaMuesca,
  largo,
  mul,
  ORDEN_ESQUINAS,
  sub,
  verticesBase,
  type Pt,
} from './geometria';
import type { EsquinaId, Perforacion, Pieza } from './tipos';

// Detalles ampliados del plano (2026-10-29, diseño 2 elegido por el usuario): el plano principal
// conserva todas sus cotas y, al lado, cada zona pequeña se dibuja más grande y repite sus cifras.
// Llevan detalle las muescas de esquina (con las perforaciones cercanas, como el pivote), los
// boquetes (con o sin alivios) y las medias perforaciones; los despuntes y radios no. Máximo 4 por
// hoja: si hay más, quedan las zonas más pequeñas, que son las que no se leen a escala.

export const MAX_DETALLES = 4;
/** Proporción del área de dibujo de la hoja FOR-005 (710 × 720, ver `exportar/imagen.ts`). */
const RATIO_HOJA = 710 / 720;

export type ElementoZona =
  | { tipo: 'muesca'; esquina: EsquinaId }
  | { tipo: 'boquete'; id: string }
  | { tipo: 'media-perforacion'; id: string }
  | { tipo: 'perforacion'; id: string };

export interface CajaMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ZonaDetalle {
  /** «DETALLE n». Se numeran de arriba abajo y de izquierda a derecha. */
  numero: number;
  elementos: ElementoZona[];
  /** Parte del vidrio que muestra el detalle, en mm. */
  caja: CajaMm;
  /** Punto del plano principal al que apunta el número. */
  ancla: Pt;
  /** Medida del elemento más grande de la zona: decide cuáles quedan si sobran. */
  tam: number;
}

/** Rectángulo de la hoja (unidades del plano) donde va el cuadro de un detalle. */
export interface CeldaDetalle {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clave = (e: ElementoZona) => (e.tipo === 'muesca' ? 'm' + e.esquina : e.tipo + e.id);
const unir = (a: CajaMm, b: CajaMm): CajaMm => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
const seTocan = (a: CajaMm, b: CajaMm) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const contiene = (c: CajaMm, p: Pt) => p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY;

/** Agrega aire alrededor de la zona y le da un tamaño mínimo, para que se vea el canto que la rodea. */
function conAire(c: CajaMm): CajaMm {
  const w = c.maxX - c.minX;
  const h = c.maxY - c.minY;
  const pad = Math.max(w, h) * 0.3 + 20;
  const lado = Math.max(w, h) + 2 * pad;
  const minLado = Math.max(lado * 0.6, 120);
  const ew = Math.max(w + 2 * pad, minLado);
  const eh = Math.max(h + 2 * pad, minLado);
  const cx = (c.minX + c.maxX) / 2;
  const cy = (c.minY + c.maxY) / 2;
  return { minX: cx - ew / 2, maxX: cx + ew / 2, minY: cy - eh / 2, maxY: cy + eh / 2 };
}

/** Zonas del vidrio que llevan detalle, ya numeradas. Vacío si no hay ninguna. */
export function zonasDetalle(pieza: Pieza): ZonaDetalle[] {
  if (esCirculo(pieza)) return [];
  const v = verticesBase(pieza);
  const bs = bordesDe(v);
  const curvo = bordeCurvo(pieza);
  const perfs = pieza.operaciones
    .filter((o): o is Perforacion => o.tipo === 'perforacion')
    .map((o) => ({ o, c: centroPerforacion(pieza, o, v) }));
  const cajaPerf = (p: (typeof perfs)[number]): CajaMm => ({ minX: p.c.x - p.o.d / 2, maxX: p.c.x + p.o.d / 2, minY: p.c.y - p.o.d / 2, maxY: p.c.y + p.o.d / 2 });

  type Bruta = Omit<ZonaDetalle, 'numero'>;
  const brutas: Bruta[] = [];

  const esquinas = esquinasDe(pieza);
  for (const e of ORDEN_ESQUINAS) {
    const t = esquinas[e];
    if (t.tipo !== 'muesca') continue;
    const g = geometriaMuesca(e, v, bs, t);
    // El pivote (perf. Ø16 a 60 × 135 de una muesca 110×35) cae en este alcance; la cerradura no.
    const alcance = Math.max(t.a, t.b) * 2.5 + 100;
    const cercanas = perfs.filter((p) => largo(sub(p.c, g.V)) <= alcance);
    const caja = cercanas.map(cajaPerf).reduce(unir, cajaDe([g.V, g.p1, g.p2, g.p3]));
    brutas.push({ elementos: [{ tipo: 'muesca', esquina: e }, ...cercanas.map((p) => ({ tipo: 'perforacion' as const, id: p.o.id }))], caja, ancla: g.p2, tam: Math.max(t.a, t.b) });
  }

  for (const o of pieza.operaciones) {
    if (o.tipo === 'boquete') {
      if (o.borde === curvo) continue;
      const g = geometriaBoquete(o, bs[o.borde]);
      const al = geometriaAlivios(o, bs[o.borde]);
      const pts = [g.A, g.B, g.C, g.D];
      if (al && 'centros' in al) al.centros.forEach((c) => pts.push(add(c, { x: -al.r, y: -al.r }), add(c, { x: al.r, y: al.r })));
      let caja = cajaDe(pts);
      // Perforaciones metidas en el boquete o pegadas a él (la ranura «ojo» del Optiglass).
      const m = Math.max(o.largo, o.prof) * 0.35;
      const amplia = { minX: caja.minX - m, minY: caja.minY - m, maxX: caja.maxX + m, maxY: caja.maxY + m };
      const dentro = perfs.filter((p) => contiene(amplia, p.c));
      caja = dentro.map(cajaPerf).reduce(unir, caja);
      brutas.push({ elementos: [{ tipo: 'boquete', id: o.id }, ...dentro.map((p) => ({ tipo: 'perforacion' as const, id: p.o.id }))], caja, ancla: mul(add(g.B, g.C), 0.5), tam: Math.max(o.largo, o.prof) });
    } else if (o.tipo === 'media-perforacion') {
      if (o.borde === curvo || !(o.d > 0)) continue;
      const g = geometriaMediaPerforacion(o, bs[o.borde]);
      brutas.push({ elementos: [{ tipo: 'media-perforacion', id: o.id }], caja: { minX: g.C.x - g.r, maxX: g.C.x + g.r, minY: g.C.y - g.r, maxY: g.C.y + g.r }, ancla: g.C, tam: o.d });
    }
  }

  // Zonas que se tocan (con su aire) se dibujan en un solo detalle.
  let zonas = brutas.map((z) => ({ ...z, caja: conAire(z.caja) }));
  for (let unida = true; unida; ) {
    unida = false;
    outer: for (let i = 0; i < zonas.length; i++) {
      for (let j = i + 1; j < zonas.length; j++) {
        if (!seTocan(zonas[i].caja, zonas[j].caja)) continue;
        const a = zonas[i];
        const b = zonas[j];
        const vistos = new Set<string>();
        const elementos = [...a.elementos, ...b.elementos].filter((e) => (vistos.has(clave(e)) ? false : (vistos.add(clave(e)), true)));
        zonas = [...zonas.slice(0, i), { elementos, caja: unir(a.caja, b.caja), ancla: a.ancla, tam: Math.max(a.tam, b.tam) }, ...zonas.slice(i + 1, j), ...zonas.slice(j + 1)];
        unida = true;
        break outer;
      }
    }
  }

  if (zonas.length > MAX_DETALLES) zonas = [...zonas].sort((a, b) => a.tam - b.tam).slice(0, MAX_DETALLES);
  const centroY = (z: Bruta) => (z.caja.minY + z.caja.maxY) / 2;
  const centroX = (z: Bruta) => (z.caja.minX + z.caja.maxX) / 2;
  return zonas
    .sort((a, b) => centroY(a) - centroY(b) || centroX(a) - centroX(b))
    .map((z, i) => ({ ...z, numero: i + 1 }));
}

/**
 * Encuadre de la hoja completa: el plano principal (`encuadre`) más el espacio de los detalles. Si
 * el plano es más alto que ancho (puertas, cabinas) los detalles van en una columna a la derecha,
 * donde la hoja casi cuadrada deja espacio libre; si es más ancho (fijos, ventanas), en una fila
 * abajo. Sin detalles (o en las miniaturas) es el mismo encuadre de siempre.
 */
export function encuadreHoja(pieza: Pieza, conCotas = true) {
  const e = encuadre(pieza, conCotas);
  const x0 = e.caja.minX - e.M;
  const y0 = e.caja.minY - e.M;
  const zonas = conCotas ? zonasDetalle(pieza) : [];
  const vista = { x: x0, y: y0, w: e.anchoTotal, h: e.altoTotal };
  if (!zonas.length) return { ...e, zonas, celdas: [] as CeldaDetalle[], vista };
  const n = zonas.length;
  const gap = e.f * 1.2;
  const entre = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
  let celdas: CeldaDetalle[];
  if (e.altoTotal >= e.anchoTotal) {
    const cw = entre(e.altoTotal * RATIO_HOJA - e.anchoTotal, e.altoTotal * 0.3, e.altoTotal * 0.55);
    const ch = Math.min((e.altoTotal - gap * (n + 1)) / n, cw * 0.85);
    celdas = zonas.map((_, i) => ({ x: x0 + e.anchoTotal, y: y0 + gap + i * (ch + gap), w: cw - gap, h: ch }));
    vista.w += cw;
  } else {
    const rh = entre(e.anchoTotal / RATIO_HOJA - e.altoTotal, e.anchoTotal * 0.28, e.anchoTotal * 0.5);
    const cw = Math.min((e.anchoTotal - gap * (n + 1)) / n, rh * 1.3);
    celdas = zonas.map((_, i) => ({ x: x0 + gap + i * (cw + gap), y: y0 + e.altoTotal, w: cw, h: rh - gap }));
    vista.h += rh;
  }
  return { ...e, zonas, celdas, vista };
}
