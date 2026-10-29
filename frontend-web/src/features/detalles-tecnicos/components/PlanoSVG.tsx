import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import {
  add,
  bordeCurvo,
  bordesDe,
  cajaDe,
  centroPerforacion,
  contornoDe,
  esCirculo,
  esquinasDe,
  geometriaAlivios,
  geometriaBoquete,
  geometriaMediaPerforacion,
  geometriaMuesca,
  largo,
  limitesDe,
  mul,
  ORDEN_ESQUINAS,
  origenBoquete,
  pathDe,
  puntosSobreArco,
  radioArco,
  sub,
  unit,
  verticesBase,
  type Pt,
} from '../modelo/geometria';
import { encuadreHoja } from '../modelo/detalles';
import type { Boquete, Perforacion, Pieza } from '../modelo/tipos';
import { ACENTO, anchoTexto, cajaEtiqueta, COTA, colocarCota, crearColocador, DibujoCota, fmt, ladoHacia, SUAVE, Texto, TINTA, VIDRIO, type CotaProps } from './cotas';
import { DetallesSVG } from './DetallesSVG';

/** Tamaño de las cotas generales (ANCHO, ALTO, Ø del círculo): las que más se leen del plano. */
const K_GENERAL = 1.3;

/**
 * Muescas dibujadas más grandes que a escala (calco del taller, 2026-10-29): una 150×35 en una puerta
 * de 2 m eran un par de píxeles y sus cotas quedaban sueltas en la esquina. Cada lado se lleva a un
 * mínimo visible; las cifras siguen siendo las reales. Si la muesca agrandada taparía una perforación
 * o un recorte del canto, esa esquina queda a escala.
 */
function agrandarMuescas(pieza: Pieza, f: number): Pieza {
  const minimo = f * 1.2;
  const v = verticesBase(pieza);
  const bs = bordesDe(v);
  const ocupadas = pieza.operaciones.flatMap((o) => {
    if (o.tipo === 'perforacion') {
      const c = centroPerforacion(pieza, o, v);
      return [{ minX: c.x - o.d / 2, maxX: c.x + o.d / 2, minY: c.y - o.d / 2, maxY: c.y + o.d / 2 }];
    }
    if (o.tipo === 'boquete') {
      const g = geometriaBoquete(o, bs[o.borde]);
      return [cajaDe([g.A, g.B, g.C, g.D])];
    }
    if (o.tipo === 'media-perforacion') {
      const g = geometriaMediaPerforacion(o, bs[o.borde]);
      return [{ minX: g.C.x - g.r, maxX: g.C.x + g.r, minY: g.C.y - g.r, maxY: g.C.y + g.r }];
    }
    return [];
  });
  const esquinas = esquinasDe(pieza);
  let cambio = false;
  const nuevas = { ...pieza.esquinas };
  for (const e of ORDEN_ESQUINAS) {
    const t = esquinas[e];
    if (t.tipo !== 'muesca' || (t.a >= minimo && t.b >= minimo)) continue;
    const n = { tipo: 'muesca' as const, a: Math.max(t.a, minimo), b: Math.max(t.b, minimo) };
    const g = geometriaMuesca(e, v, bs, n);
    const c = cajaDe([g.V, g.p1, g.p2, g.p3]);
    const aire = f * 0.5;
    const tapa = ocupadas.some((o) => o.maxX >= c.minX - aire && o.minX <= c.maxX + aire && o.maxY >= c.minY - aire && o.minY <= c.maxY + aire);
    if (tapa) continue;
    nuevas[e] = n;
    cambio = true;
  }
  return cambio ? { ...pieza, esquinas: nuevas } : pieza;
}

/**
 * Reparte los textos de una cadena de cotas para que no se monten: cada texto quiere ir al centro de
 * su tramo; si no cabe, se corre hacia adentro de la cadena manteniendo el orden. Trabaja en
 * «distancia desde el borde» (s); devuelve la posición s de cada texto.
 */
function repartir(tramos: { ini: number; fin: number; ancho: number }[], gap: number): number[] {
  const pos = tramos.map((s) => (s.ini + s.fin) / 2);
  if (tramos.length) pos[0] = Math.max(pos[0], tramos[0].ini + tramos[0].ancho / 2 + gap);
  for (let i = 1; i < pos.length; i++) {
    pos[i] = Math.max(pos[i], pos[i - 1] + (tramos[i - 1].ancho + tramos[i].ancho) / 2 + gap);
  }
  return pos;
}

/**
 * Esquinas inferiores que van a 90° en un vidrio con desplome. Desplome lateral: la del lado
 * vertical (el opuesto al inclinado). Descuadre superior: las dos de abajo. Rectangular: ninguna
 * (las cuatro van a escuadra y marcarlas sería ruido).
 */
export function esquinas90Inferiores(pieza: Pieza): ('ii' | 'id')[] {
  const c = pieza.contorno;
  if (c.tipo === 'desplome-lateral') return [c.lado === 'der' ? 'ii' : 'id'];
  if (c.tipo === 'desplome-superior') return ['ii', 'id'];
  return [];
}

export interface Interaccion {
  svgRef: Ref<SVGSVGElement>;
  onPointerDownOp: (id: string, e: ReactPointerEvent) => void;
  onPointerDownFondo: (e: ReactPointerEvent) => void;
  arrastrando?: boolean;
}

interface Props {
  pieza: Pieza;
  selloEnCanto?: boolean;
  /** false = miniatura sin cotas ni textos. */
  conCotas?: boolean;
  width?: number | string;
  height?: number | string;
  /** Proceso bajo el mouse en el editor. */
  resaltarId?: string | null;
  /** Proceso seleccionado (y su herraje). */
  seleccionIds?: string[];
  /** Sólo en pantalla: permite seleccionar y arrastrar, y muestra el número de cada proceso. */
  interaccion?: Interaccion;
}

export function PlanoSVG({ pieza, selloEnCanto, conCotas = true, width = '100%', height = '100%', resaltarId, seleccionIds = [], interaccion }: Props) {
  // La hoja incluye, a la derecha o abajo, el espacio de los detalles ampliados (2026-10-29).
  const { v, caja, W, H, m, f, zonas, celdas, vista } = encuadreHoja(pieza, conCotas);
  const viewBox = `${vista.x} ${vista.y} ${vista.w} ${vista.h}`;
  const centro = { x: (caja.minX + caja.maxX) / 2, y: (caja.minY + caja.maxY) / 2 };
  const bs = bordesDe(v);
  const L = limitesDe(v);
  const piezaVisual = conCotas ? agrandarMuescas(pieza, f) : pieza;
  const contorno = contornoDe(piezaVisual);
  const path = pathDe(contorno);
  const numero = new Map(pieza.operaciones.map((o, i) => [o.id, i + 1]));
  const sel = new Set(seleccionIds);
  const destacado = (id: string) => sel.has(id) || resaltarId === id;
  const agarre = interaccion ? { cursor: interaccion.arrastrando ? 'grabbing' : 'grab' } : undefined;
  const alPresionar = (id: string) => (interaccion ? (e: ReactPointerEvent) => interaccion.onPointerDownOp(id, e) : undefined);

  const perfs = pieza.operaciones.filter((o): o is Perforacion => o.tipo === 'perforacion');
  const centros = perfs.map((o) => centroPerforacion(pieza, o, v));
  // Las perforaciones chicas se dibujan más grandes que a escala, como en el plano del taller: una Ø14
  // en una puerta de 2 m quedaba como un punto. La medida escrita sigue siendo la real. El agrandado
  // se frena antes de que dos vecinas se toquen (las 3 perforaciones de la flauta, a 35 mm).
  let sepMin = Infinity;
  centros.forEach((a, i) => centros.slice(i + 1).forEach((b) => (sepMin = Math.min(sepMin, largo(sub(a, b))))));
  const rMinimo = conCotas ? Math.max(f * 0.28, Math.min(f * 0.4, sepMin * 0.42)) : m * 0.01;
  const rVisual = (d: number) => Math.max(d / 2, rMinimo);
  const fc = f * 0.8;
  const curvo = bordeCurvo(pieza);
  const circulo = esCirculo(pieza);

  const elementos: ReactNode[] = [];
  const numeros: ReactNode[] = [];

  // Espacio ocupado: ningún número tapa el borde del vidrio, una perforación (con su cruz) ni otro número.
  const espacio = crearColocador();
  // El círculo se anota por puntos sobre la circunferencia: sus vértices son los extremos de un
  // diámetro y la recta entre ellos cruzaría el vidrio por el medio.
  const bordeAnotado = circulo ? contorno.flatMap((p, i) => (p.circ && i > 0 ? puntosSobreArco(contorno[i - 1], p.circ, p) : [p])) : contorno;
  bordeAnotado.forEach((p, i) => espacio.linea(p, bordeAnotado[(i + 1) % bordeAnotado.length]));
  perfs.forEach((o, i) => {
    const r = rVisual(o.d) * 1.6;
    espacio.ocupar({ x1: centros[i].x - r, y1: centros[i].y - r, x2: centros[i].x + r, y2: centros[i].y + r });
  });
  const cota = (key: string, p: CotaProps) => {
    const c = colocarCota(espacio, p, centro);
    return c ? <DibujoCota key={key} a={p.a} b={p.b} texto={p.texto} f={p.f} color={p.color} bold={p.bold} c={c} /> : null;
  };
  /** Anota la caja de una etiqueta (`<Texto>`) que ya tiene su sitio. */
  const ocuparTexto = (p: Pt, texto: string, f2: number, anchor: 'start' | 'middle' | 'end' = 'middle') => espacio.ocupar(cajaEtiqueta(p, texto, f2, anchor));
  /** Pastilla con el número del proceso (sólo en pantalla, no se imprime ni se exporta). */
  const pastilla = (id: string, p: Pt) => {
    if (!interaccion) return;
    const activo = destacado(id);
    numeros.push(
      <g key={'n' + id} className="solo-pantalla" pointerEvents="none">
        <circle cx={p.x} cy={p.y} r={f * 0.48} fill={activo ? ACENTO : '#fff'} stroke={activo ? ACENTO : SUAVE} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <text x={p.x} y={p.y} fontSize={f * 0.6} fill={activo ? '#fff' : SUAVE} textAnchor="middle" dominantBaseline="central" fontFamily="Arial, sans-serif" fontWeight={700}>
          {numero.get(id)}
        </text>
      </g>,
    );
  };

  /** Línea auxiliar punteada: del punto acotado a su línea de cota. */
  const lineaAux = (a: Pt, b: Pt, k: string) => {
    espacio.linea(a, b);
    return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COTA} strokeWidth={0.5} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />;
  };

  // ── Cotas generales ────────────────────────────────────────────────────────
  // Se ubican primero: mandan sobre el resto de los números del plano.
  // Con vidrios de medidas distintas en la letra, la cota dice ANCHO / ALTO: el número sería el
  // del primer vidrio y el proveedor lo leería como la medida de todos. La medida real de cada
  // vidrio va en la tabla. La segunda cota de un desplome conserva su número (decisión del usuario).
  // En el desplome lateral la medida del pedido es el ancho MAYOR (`medidaPedido`): en un «abre
  // arriba» la palabra va en la cota de arriba y la de abajo conserva su número.
  const anchoMayorArriba = pieza.contorno.tipo === 'desplome-lateral' && pieza.contorno.anchoSup > pieza.ancho;
  const palabraAbajo = !!pieza.rotulos?.ancho && !anchoMayorArriba;
  const palabraArriba = !!pieza.rotulos?.ancho && anchoMayorArriba;
  const generales: ReactNode[] = [];
  if (conCotas) {
    const off = f * 3.6;
    const ext = (a: Pt, b: Pt, k: string) => {
      espacio.linea(a, b);
      return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
    };
    const yInf = caja.maxY + off;
    generales.push(
      // En el círculo las líneas de referencia salen de los puntos donde el cuadrado lo toca.
      ext(circulo ? { x: v.ii.x, y: centro.y } : { x: v.ii.x, y: v.ii.y + f * 0.4 }, { x: v.ii.x, y: yInf + f * 0.5 }, 'e1'),
      ext(circulo ? { x: v.id.x, y: centro.y } : { x: v.id.x, y: v.id.y + f * 0.4 }, { x: v.id.x, y: yInf + f * 0.5 }, 'e2'),
      cota('ancho', { a: { x: v.ii.x, y: yInf }, b: { x: v.id.x, y: yInf }, texto: palabraAbajo ? 'ANCHO' : fmt(v.id.x - v.ii.x), f: f * K_GENERAL, lado: 1, color: TINTA, bold: true }),
    );
    const xIzq = caja.minX - off;
    generales.push(
      ext(circulo ? { x: centro.x, y: v.si.y } : { x: v.si.x - f * 0.4, y: v.si.y }, { x: xIzq - f * 0.5, y: v.si.y }, 'e3'),
      ext(circulo ? { x: centro.x, y: v.ii.y } : { x: v.ii.x - f * 0.4, y: v.ii.y }, { x: xIzq - f * 0.5, y: v.ii.y }, 'e4'),
      cota('alto', { a: { x: xIzq, y: v.ii.y }, b: { x: xIzq, y: v.si.y }, texto: pieza.rotulos?.alto ? 'ALTO' : fmt(v.ii.y - v.si.y), f: f * K_GENERAL, lado: -1, color: TINTA, bold: true }),
    );
    if (pieza.contorno.tipo === 'desplome-lateral') {
      const ySup = caja.minY - off;
      generales.push(
        ext({ x: v.si.x, y: v.si.y - f * 0.4 }, { x: v.si.x, y: ySup - f * 0.5 }, 'e5'),
        ext({ x: v.sd.x, y: v.sd.y - f * 0.4 }, { x: v.sd.x, y: ySup - f * 0.5 }, 'e6'),
        cota('anchoSup', { a: { x: v.si.x, y: ySup }, b: { x: v.sd.x, y: ySup }, texto: palabraArriba ? 'ANCHO' : fmt(v.sd.x - v.si.x), f: f * K_GENERAL, lado: -1, color: TINTA, bold: true }),
      );
    }
    if (pieza.contorno.tipo === 'desplome-superior') {
      const xDer = caja.maxX + off;
      generales.push(
        ext({ x: v.sd.x + f * 0.4, y: v.sd.y }, { x: xDer + f * 0.5, y: v.sd.y }, 'e7'),
        ext({ x: v.id.x + f * 0.4, y: v.id.y }, { x: xDer + f * 0.5, y: v.id.y }, 'e8'),
        cota('altoDer', { a: { x: xDer, y: v.sd.y }, b: { x: xDer, y: v.id.y }, texto: fmt(v.id.y - v.sd.y), f: f * K_GENERAL, lado: -1, color: TINTA, bold: true }),
      );
    }
  }

  // ── Chaflanes ──────────────────────────────────────────────────────────────
  for (const o of pieza.operaciones) {
    if (o.tipo !== 'chaflan') continue;
    const b = bs[o.borde];
    const w = Math.max(o.ancho, f * 0.5);
    // En el canto curvo de un arco el chaflán sigue la curva, por dentro, a `w` del borde.
    const enArco = o.borde === curvo;
    const rA = radioArco(pieza);
    const cA = add(mul(add(b.S, b.T), 0.5), mul(b.n, rA));
    const s = enArco ? add(cA, mul(b.d, -(rA - w))) : add(b.S, mul(b.n, w));
    const t = enArco ? add(cA, mul(b.d, rA - w)) : add(b.T, mul(b.n, w));
    const d = enArco ? `M${s.x} ${s.y} A${rA - w} ${rA - w} 0 0 1 ${t.x} ${t.y}` : `M${s.x} ${s.y} L${t.x} ${t.y}`;
    const pLbl = enArco ? add(cA, mul(b.n, -(rA - w - f * 1.1))) : add(mul(add(b.S, b.T), 0.5), mul(b.n, w + f * 1.1));
    if (conCotas) ocuparTexto(pLbl, `CHAFLÁN ${o.ancho} mm`, f * 0.85);
    elementos.push(
      <g key={o.id} onPointerDown={alPresionar(o.id)} style={interaccion ? { cursor: 'pointer' } : undefined}>
        {interaccion && <path d={d} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />}
        <path d={d} fill="none" stroke={destacado(o.id) ? ACENTO : TINTA} strokeDasharray="6 4" strokeWidth={destacado(o.id) ? 2.6 : 1.2} vectorEffect="non-scaling-stroke" />
        {conCotas && (
          <Texto p={pLbl} f={f * 0.85} color={destacado(o.id) ? ACENTO : TINTA}>
            {`CHAFLÁN ${o.ancho} mm`}
          </Texto>
        )}
      </g>,
    );
    pastilla(o.id, add(pLbl, mul(unit(sub(b.T, b.S)), -anchoTexto(`CHAFLÁN ${o.ancho} mm`, f * 0.85) / 2 - f * 0.6)));
  }

  // ── Perforaciones ──────────────────────────────────────────────────────────
  perfs.forEach((o, i) => {
    const c = centros[i];
    const r = rVisual(o.d);
    const activo = destacado(o.id);
    elementos.push(
      <g key={o.id} data-op={o.id} onPointerDown={alPresionar(o.id)} style={agarre}>
        {interaccion && <circle cx={c.x} cy={c.y} r={Math.max(r, f * 0.8)} fill="transparent" />}
        {sel.has(o.id) && <circle cx={c.x} cy={c.y} r={r + f * 0.35} fill="rgba(21,101,192,.12)" stroke={ACENTO} strokeWidth={1} vectorEffect="non-scaling-stroke" className="solo-pantalla" />}
        <circle cx={c.x} cy={c.y} r={r} fill="#fff" stroke={activo ? ACENTO : TINTA} strokeWidth={activo ? 2.5 : 1.3} vectorEffect="non-scaling-stroke" />
        {conCotas && (
          <>
            <line x1={c.x - r * 1.6} y1={c.y} x2={c.x + r * 1.6} y2={c.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            <line x1={c.x} y1={c.y - r * 1.6} x2={c.x} y2={c.y + r * 1.6} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </g>,
    );
    pastilla(o.id, { x: c.x + (c.x <= centro.x ? 1 : -1) * (r + f * 0.55), y: c.y + r + f * 0.55 });
    if (!conCotas) return;
    // Referidas al eje central: cota individual por dentro del vidrio.
    const col = activo ? ACENTO : COTA;
    if (o.refX === 'centro' && o.x !== 0) {
      const xRef = (L.xIzq(c.y) + L.xDer(c.y)) / 2;
      elementos.push(cota(o.id + 'x', { a: { x: Math.min(xRef, c.x), y: c.y }, b: { x: Math.max(xRef, c.x), y: c.y }, texto: fmt(Math.abs(o.x)), f: fc, lado: -1, color: col }));
    }
    if (o.refY === 'centro' && o.y !== 0) {
      const yRef = (L.ySup(c.x) + L.yInf(c.x)) / 2;
      elementos.push(cota(o.id + 'y', { a: { x: c.x, y: Math.min(yRef, c.y) }, b: { x: c.x, y: Math.max(yRef, c.y) }, texto: fmt(Math.abs(o.y)), f: fc, lado: 1, color: col }));
    }
  });

  if (conCotas) {
    const ext = lineaAux;
    const cadena = (dists: number[]) => Array.from(new Set(dists.map((d) => Math.round(d * 10) / 10))).sort((a, b) => a - b);
    const gap = fc * 0.35;
    /** Dibuja una cadena de cotas encadenadas desde un borde: `punto(s)` da la posición a distancia s. */
    const dibujarCadena = (k: string, dists: number[], punto: (s: number) => Pt, lado: number, horizontal = false) => {
      const tramos = dists.map((d, j) => {
        const ini = j === 0 ? 0 : dists[j - 1];
        return { ini, fin: d, ancho: anchoTexto(fmt(d - ini), fc) };
      });
      const pos = repartir(tramos, gap);
      tramos.forEach((tr, j) => {
        const t = (pos[j] - tr.ini) / (tr.fin - tr.ini);
        elementos.push(cota(`${k}${j}`, { a: punto(tr.ini), b: punto(tr.fin), texto: fmt(tr.fin - tr.ini), f: fc, lado, t, horizontal }));
      });
    };

    // Verticales: encadenadas desde el borde, POR DENTRO del vidrio y junto a las perforaciones (calco
    // del taller, 2026-10-29). Antes iban por fuera y el 800 · 400 quedaba lejos de lo que mide, en
    // una segunda columna al lado de la del boquete. Las cifras van hacia el centro del vidrio.
    type Lado = 'izq' | 'der';
    const grupos = new Map<string, { lado: Lado; ref: 'sup' | 'inf'; idx: number[] }>();
    perfs.forEach((o, i) => {
      if (o.refY === 'centro') return;
      const lado: Lado = o.refX === 'der' || (o.refX === 'centro' && centros[i].x > centro.x) ? 'der' : 'izq';
      const k = lado + o.refY;
      grupos.set(k, { lado, ref: o.refY, idx: [...(grupos.get(k)?.idx ?? []), i] });
    });
    const alcance = (lado: Lado, ref: 'sup' | 'inf') => Math.max(0, ...(grupos.get(lado + ref)?.idx.map((i) => perfs[i].y) ?? []));
    for (const [k, g] of Array.from(grupos)) {
      const solapa = g.ref === 'inf' && alcance(g.lado, 'sup') + alcance(g.lado, 'inf') > H;
      const rMax = Math.max(...g.idx.map((i) => rVisual(perfs[i].d)));
      const xs = g.idx.map((i) => centros[i].x);
      const off = rMax + f * (solapa ? 2.6 : 1.4);
      const xLinea = g.lado === 'izq' ? Math.max(...xs) + off : Math.min(...xs) - off;
      const yBorde = g.ref === 'sup' ? L.ySup(xLinea) : L.yInf(xLinea);
      const sgn = g.ref === 'sup' ? 1 : -1;
      dibujarCadena(`${k}v`, cadena(g.idx.map((i) => perfs[i].y)), (s) => ({ x: xLinea, y: yBorde + sgn * s }), sgn * (g.lado === 'izq' ? -1 : 1), true);
      // Una sola línea auxiliar por altura: desde la perforación más cercana a la cadena.
      const porAltura = new Map<number, number>();
      for (const i of g.idx) {
        const k2 = Math.round(perfs[i].y * 10);
        const actual = porAltura.get(k2);
        const masCerca = (a: number, b: number) => (g.lado === 'izq' ? centros[a].x > centros[b].x : centros[a].x < centros[b].x);
        if (actual === undefined || masCerca(i, actual)) porAltura.set(k2, i);
      }
      for (const i of Array.from(porAltura.values())) {
        const c = centros[i];
        const r = rVisual(perfs[i].d);
        elementos.push(ext({ x: c.x + (g.lado === 'izq' ? r : -r), y: c.y }, { x: xLinea + (g.lado === 'izq' ? 1 : -1) * f * 0.3, y: c.y }, `${k}e${i}`));
      }
    }

    // Horizontales: sobre cada fila de perforaciones, encadenadas desde el borde de referencia.
    const filas = new Map<string, number[]>();
    perfs.forEach((o, i) => {
      if (o.refX === 'centro') return;
      const k = `${o.refX}|${Math.round(centros[i].y)}`;
      filas.set(k, [...(filas.get(k) ?? []), i]);
    });
    // Una sola cota por columna (2026-10-23): filas con las mismas distancias al mismo canto y cercanas
    // entre sí (la manija Roma, las 3 perforaciones de la flauta) se acotan una vez, sobre la fila de
    // arriba, como en el plano del taller. Antes cada fila repetía su «30» y quedaban apilados.
    const columnas = new Map<string, string[]>();
    for (const [k, idx] of Array.from(filas)) {
      const kc = `${perfs[idx[0]].refX}|${cadena(idx.map((i) => perfs[i].x)).join(',')}`;
      columnas.set(kc, [...(columnas.get(kc) ?? []), k]);
    }
    const yFila = (k: string) => centros[filas.get(k)![0]].y;
    for (const ks of Array.from(columnas.values())) {
      ks.sort((p, q) => yFila(p) - yFila(q));
      const grupos: string[][] = [];
      for (const k of ks) {
        const g = grupos[grupos.length - 1];
        if (g && yFila(k) - yFila(g[g.length - 1]) <= H * 0.25) g.push(k);
        else grupos.push([k]);
      }
      for (const g of grupos) {
        const k = g[0];
        const idx = filas.get(k)!;
        const refX = perfs[idx[0]].refX;
        const rMax = Math.max(...idx.map((i) => rVisual(perfs[i].d)));
        const yLinea = centros[idx[0]].y - rMax - f * 0.9;
        const xRef = refX === 'izq' ? L.xIzq(yLinea) : L.xDer(yLinea);
        const sgn = refX === 'izq' ? 1 : -1;
        dibujarCadena(`${k}h`, cadena(idx.map((i) => perfs[i].x)), (s) => ({ x: xRef + sgn * s, y: yLinea }), -sgn);
        for (const i of idx) {
          const c = centros[i];
          elementos.push(ext({ x: c.x, y: c.y - rVisual(perfs[i].d) }, { x: c.x, y: yLinea - f * 0.3 }, `${k}e${i}`));
        }
      }
    }

    // Una etiqueta por diámetro, junto a la primera perforación de ese diámetro.
    const porDiametro = new Map<number, number[]>();
    perfs.forEach((o, i) => porDiametro.set(o.d, [...(porDiametro.get(o.d) ?? []), i]));
    // La etiqueta esquiva la de los boquetes (misma posición que en su bloque): en una puerta con
    // manija a los dos lados de la cerradura, «2 PERF. Ø14» caía encima de «BOQ 150×35».
    const etiquetasBoquete = pieza.operaciones
      .filter((o): o is Boquete => o.tipo === 'boquete')
      .map((o) => {
        const g = geometriaBoquete(o, bs[o.borde]);
        return add(mul(add(g.B, g.C), 0.5), mul(bs[o.borde].n, f * 1.3));
      });
    const lejosDeBoquetes = (p: Pt) => etiquetasBoquete.every((q) => Math.abs(q.y - p.y) > f * 1.3 || Math.abs(q.x - p.x) > W * 0.45);
    for (const [d, idx] of Array.from(porDiametro)) {
      const c = centros[idx[0]];
      const dir = c.x <= centro.x ? 1 : -1;
      const vert = c.y <= centro.y ? 1 : -1;
      const texto = `${idx.length > 1 ? idx.length + ' ' : ''}PERF. Ø${d} mm`;
      const anchor = dir > 0 ? 'start' : 'end';
      // Si junto a la perforación pasa su cadena de cotas (calco, por dentro del vidrio), la etiqueta
      // se corre más allá de la cadena.
      const candidatos = [0.9, 3.4, 5.6].flatMap((sx) => [3.4, -1.6, 5, -3.2, 6.6].map((k) => ({ x: c.x + dir * (rVisual(d) + f * sx), y: c.y + vert * f * k })));
      const p = candidatos.find((q) => lejosDeBoquetes(q) && espacio.libre(cajaEtiqueta(q, texto, f * 0.85, anchor))) ?? candidatos[0];
      ocuparTexto(p, texto, f * 0.85, anchor);
      elementos.push(
        <Texto key={'lbl' + d} p={p} f={f * 0.85} anchor={anchor} bold>
          {texto}
        </Texto>,
      );
    }
  }

  // ── Boquetes ───────────────────────────────────────────────────────────────
  for (const o of pieza.operaciones) {
    if (o.tipo !== 'boquete') continue;
    const borde = bs[o.borde];
    const g = geometriaBoquete(o, borde);
    const activo = destacado(o.id);
    const col = activo ? ACENTO : COTA;
    if (interaccion) {
      // Zona de agarre: el boquete más un margen hacia afuera del vidrio.
      const fuera = mul(borde.n, -f * 0.7);
      const pts = [add(g.A, fuera), g.B, g.C, add(g.D, fuera)].map((p) => `${p.x},${p.y}`).join(' ');
      elementos.push(
        <polygon
          key={o.id + 'z'}
          data-op={o.id}
          points={pts}
          fill={sel.has(o.id) ? 'rgba(21,101,192,.18)' : 'transparent'}
          stroke={sel.has(o.id) ? ACENTO : 'none'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          onPointerDown={alPresionar(o.id)}
          style={agarre}
          className="solo-pantalla"
        />,
      );
    }
    const inward = mul(add(g.B, g.C), 0.5);
    const al = geometriaAlivios(o, borde);
    const conAlivio = !!al && 'pts' in al;
    pastilla(o.id, add(inward, mul(borde.n, -f * 1.6)));
    if (!conCotas) continue;
    // Ranura tipo «ojo» (boquete que abre una perforación al canto, como el kit Optiglass): la
    // perforación ya lleva sus cotas, así que se acota solo el ancho de la ranura, como en el plano del
    // taller. La etiqueta «BOQ» y la cota al borde de la ranura (79) tapaban la de la perforación (85).
    // Solo cambia el dibujo: la ranura sigue contando como BOQ.
    const xs = [g.A, g.B, g.C, g.D].map((q) => q.x);
    const ys = [g.A, g.B, g.C, g.D].map((q) => q.y);
    const esOjo = !conAlivio && perfs.some((p, i) => {
      const r = p.d / 2;
      const c = centros[i];
      return c.x >= Math.min(...xs) - r && c.x <= Math.max(...xs) + r && c.y >= Math.min(...ys) - r && c.y <= Math.max(...ys) + r;
    });
    if (esOjo) {
      const off = mul(borde.n, -f * 2.4);
      const a = add(g.A, off);
      const b = add(g.D, off);
      const dd = unit(sub(b, a));
      const lado = -dd.y * -borde.n.x + dd.x * -borde.n.y > 0 ? 1 : -1;
      elementos.push(
        lineaAux(g.A, add(a, mul(borde.n, -f * 0.3)), o.id + 'ea'),
        lineaAux(g.D, add(b, mul(borde.n, -f * 0.3)), o.id + 'eb'),
        cota(o.id + 'w', { a, b, texto: fmt(o.largo), f: fc, lado, color: col }),
      );
      continue;
    }
    // Calco del taller (2026-10-29): el fondo y el largo se acotan sobre la forma —el 90 sobre un lado
    // y el 75 al fondo— en vez de la etiqueta «BOQ 75×90 R37.5». Solo queda escrito lo que no es una
    // medida lineal: el radio o los alivios.
    const sep = fc * 0.9;
    const lat = mul(borde.d, -sep);
    const fa = add(g.A, lat);
    const fb = add(g.B, lat);
    const la = add(g.B, mul(borde.n, sep));
    const lb = add(g.C, mul(borde.n, sep));
    elementos.push(
      lineaAux(g.B, add(fb, mul(borde.d, -f * 0.3)), o.id + 'ef'),
      cota(o.id + 'fo', { a: fa, b: fb, texto: fmt(o.prof), f: fc, lado: ladoHacia(fa, fb, mul(borde.d, -1)), color: col }),
      lineaAux(g.B, add(la, mul(borde.n, f * 0.3)), o.id + 'el'),
      lineaAux(g.C, add(lb, mul(borde.n, f * 0.3)), o.id + 'em'),
      cota(o.id + 'la', { a: la, b: lb, texto: fmt(o.largo), f: fc, lado: ladoHacia(la, lb, borde.n), color: col }),
    );
    // El radio lo escribe su detalle; aquí solo si el boquete se quedó sin detalle (más de 4 zonas).
    const conDetalle = zonas.some((z) => z.elementos.some((e) => e.tipo === 'boquete' && e.id === o.id));
    const etiqueta = conAlivio ? `ALIVIOS Ø${fmt(o.alivio!.d)}` : o.radio && !conDetalle ? `R${fmt(o.radio)}` : '';
    if (etiqueta) {
      const anchor = Math.abs(borde.n.x) > 0.5 ? (borde.n.x < 0 ? 'end' : 'start') : 'middle';
      const candidatos = [2.6, 3.8, 5].map((k) => add(inward, mul(borde.n, f * k)));
      const pLbl = candidatos.find((q) => espacio.libre(cajaEtiqueta(q, etiqueta, fc, anchor))) ?? candidatos[0];
      ocuparTexto(pLbl, etiqueta, fc, anchor);
      elementos.push(
        <Texto key={o.id + 'l'} p={pLbl} f={fc} anchor={anchor} color={col} bold={activo}>
          {etiqueta}
        </Texto>,
      );
    }
    if (conAlivio) {
      // Fondo de los alivios: del canto al punto más profundo, junto al alivio del lado A.
      const lateral = mul(borde.d, -(al.r + fc * 1.2 + sep));
      const a = add(g.A, lateral);
      const b = add(a, mul(borde.n, o.alivio!.fondo));
      elementos.push(
        cota(o.id + 'f', { a, b, texto: fmt(o.alivio!.fondo), f: fc, lado: 1, color: col, t: o.alivio!.fondo < anchoTexto(fmt(o.alivio!.fondo), fc) + fc ? 1.8 : 0.5 }),
      );
    }
    if (o.largo > 0) {
      // Posición hasta el CENTRO del boquete, como la escribe el taller (decisión del usuario,
      // 2026-10-29): 1000 y no 962,5. El modelo sigue guardando `pos` hasta el inicio del boquete.
      // Va por fuera del vidrio; las cadenas de perforaciones ya no ocupan ese carril.
      const off = mul(borde.n, -f * 1.4);
      const origen = origenBoquete(o, borde);
      const medio = mul(add(g.A, g.D), 0.5);
      const ini = add(origen, off);
      const fin = add(medio, off);
      const posCentro = o.pos + o.largo / 2;
      elementos.push(lineaAux(medio, add(fin, mul(borde.n, -f * 0.3)), o.id + 'ep'));
      const lado = ladoHacia(ini, fin, mul(borde.n, -1));
      // Si la distancia es corta, el número se corre hacia el boquete para que no choque con la esquina.
      const w = anchoTexto(fmt(posCentro), fc);
      const t = posCentro < w + fc ? (w / 2 + fc * 0.4) / posCentro + 1 : 0.5;
      elementos.push(cota(o.id + 'p', { a: ini, b: fin, texto: fmt(posCentro), f: fc, lado, color: col, t }));
    }
  }

  // ── Medias perforaciones ───────────────────────────────────────────────────
  // El semicírculo ya va recortado en el contorno; aquí van la zona de agarre, el realce, la cruz
  // de centro sobre el canto, la etiqueta y la cota del extremo del canto al centro.
  for (const o of pieza.operaciones) {
    if (o.tipo !== 'media-perforacion') continue;
    const borde = bs[o.borde];
    const g = geometriaMediaPerforacion(o, borde);
    const activo = destacado(o.id);
    const col = activo ? ACENTO : COTA;
    const r = Math.max(g.r, f * 0.28);
    if (interaccion) {
      elementos.push(
        <circle
          key={o.id + 'z'}
          data-op={o.id}
          cx={g.C.x}
          cy={g.C.y}
          r={Math.max(r, f * 0.8)}
          fill={sel.has(o.id) ? 'rgba(21,101,192,.18)' : 'transparent'}
          stroke={sel.has(o.id) ? ACENTO : 'none'}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          onPointerDown={alPresionar(o.id)}
          style={agarre}
          className="solo-pantalla"
        />,
      );
    }
    if (activo && g.r > 0) {
      elementos.push(
        <path
          key={o.id + 'a'}
          d={`M${g.A.x} ${g.A.y} A${g.r} ${g.r} 0 0 0 ${g.D.x} ${g.D.y}`}
          fill="none"
          stroke={ACENTO}
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
      );
    }
    pastilla(o.id, add(g.C, mul(borde.n, -f * 1.6)));
    if (!conCotas) continue;
    const brazo = r * 1.6;
    const a1 = add(g.C, mul(borde.d, -brazo));
    const a2 = add(g.C, mul(borde.d, brazo));
    const n2 = add(g.C, mul(borde.n, brazo));
    elementos.push(
      <g key={o.id + 'c'} pointerEvents="none">
        <line x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        <line x1={g.C.x} y1={g.C.y} x2={n2.x} y2={n2.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      </g>,
    );
    const pLbl = add(g.C, mul(borde.n, r + f * 1.3));
    const anchor = Math.abs(borde.n.x) > 0.5 ? (borde.n.x < 0 ? 'end' : 'start') : 'middle';
    ocuparTexto(pLbl, `½ PERF. Ø${fmt(o.d)} mm`, fc, anchor);
    elementos.push(
      <Texto key={o.id + 'l'} p={pLbl} f={fc} anchor={anchor} color={col} bold>
        {`½ PERF. Ø${fmt(o.d)} mm`}
      </Texto>,
    );
    if (o.pos > 0) {
      const off = mul(borde.n, -f * 1.4);
      const origen = origenBoquete(o, borde);
      const ini = add(origen, off);
      const fin = add(g.C, off);
      const dd = unit(sub(fin, ini));
      const nn = { x: -dd.y, y: dd.x };
      const lado = nn.x * -borde.n.x + nn.y * -borde.n.y > 0 ? 1 : -1;
      const w = anchoTexto(fmt(o.pos), fc);
      const t = o.pos < w + fc ? (w / 2 + fc * 0.4) / o.pos + 1 : 0.5;
      elementos.push(cota(o.id + 'p', { a: ini, b: fin, texto: fmt(o.pos), f: fc, lado, color: col, t }));
    }
  }

  // ── Esquinas ───────────────────────────────────────────────────────────────
  if (conCotas) {
    const esquinas = esquinasDe(pieza);
    const esquinasVisuales = esquinasDe(piezaVisual);
    for (const e of ORDEN_ESQUINAS) {
      const t = esquinas[e];
      if (t.tipo === 'recta') continue;
      const V = v[e];
      const tv = esquinasVisuales[e];
      if (t.tipo === 'muesca' && tv.tipo === 'muesca') {
        // Cotas sobre los dos lados interiores del recorte, como en la hoja «BOQUETE». Las líneas
        // siguen la muesca dibujada (agrandada si era muy chica); las cifras son las reales.
        const { lIn, lOut } = geometriaMuesca(e, v, bs, t);
        const { p1, p2, p3 } = geometriaMuesca(e, v, bs, tv);
        const lado = (a: Pt, b: Pt) => {
          const d = unit(sub(b, a));
          const mid = mul(add(a, b), 0.5);
          return -d.y * (centro.x - mid.x) + d.x * (centro.y - mid.y) > 0 ? 1 : -1;
        };
        elementos.push(
          cota(e + 'm1', { a: p1, b: p2, texto: fmt(lOut), f: fc, lado: lado(p1, p2) }),
          cota(e + 'm2', { a: p2, b: p3, texto: fmt(lIn), f: fc, lado: lado(p2, p3) }),
        );
        continue;
      }
      const tam = t.tipo === 'radio' ? t.r : Math.max(t.a, t.b);
      // Junto a la esquina, alineada desde su canto hacia adentro (centrada en la diagonal, en un vidrio
      // angosto se salía por el canto); si choca —la etiqueta de perforaciones de las corredizas—, más abajo.
      const texto = t.tipo === 'radio' ? `R ${t.r}` : `DESP. ${t.a}×${t.b}`;
      const izq = V.x <= centro.x;
      const anchor = izq ? 'start' : 'end';
      const vert = V.y <= centro.y ? 1 : -1;
      const candidatos = [1.6, 3, 4.4, 5.8].map((k) => ({ x: V.x + (izq ? 1 : -1) * (tam * 0.5 + f * 0.6), y: V.y + vert * (tam + f * k) }));
      const p = candidatos.find((q) => espacio.libre(cajaEtiqueta(q, texto, fc, anchor))) ?? candidatos[0];
      ocuparTexto(p, texto, fc, anchor);
      elementos.push(
        <Texto key={e} p={p} f={fc} anchor={anchor} color={COTA}>
          {texto}
        </Texto>,
      );
    }
  }

  // ── Radio del arco ─────────────────────────────────────────────────────────
  if (conCotas && curvo) {
    const b = bs[curvo];
    const rA = radioArco(pieza);
    const cA = add(mul(add(b.S, b.T), 0.5), mul(b.n, rA));
    // Línea de radio a 45° (hacia el final del canto): no choca con la etiqueta de un chaflán, que va
    // en el centro del arco, ni con las notas, que suelen ir al medio del vidrio.
    const u = unit(add(mul(b.n, -1), b.d));
    const enArco = add(cA, mul(u, rA));
    elementos.push(
      <g key="radioArco" pointerEvents="none">
        <line x1={cA.x} y1={cA.y} x2={enArco.x} y2={enArco.y} stroke={COTA} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <circle cx={cA.x} cy={cA.y} r={f * 0.15} fill={COTA} />
        <Texto p={add(cA, add(mul(u, rA * 0.62), mul({ x: -u.y, y: u.x }, -fc * 0.8)))} f={fc} color={COTA} bold>
          {`R ${fmt(rA)}`}
        </Texto>
      </g>,
    );
  }

  // ── Diámetro del círculo ───────────────────────────────────────────────────
  // Línea de diámetro a 45° (no choca con una perforación central ni con las cotas ANCHO / ALTO).
  if (conCotas && circulo) {
    const r = W / 2;
    const u = unit({ x: 1, y: -1 });
    const a = add(centro, mul(u, -r));
    const b = add(centro, mul(u, r));
    const texto = `Ø ${pieza.rotulos?.ancho ? 'ANCHO' : fmt(W)}`;
    // Del tamaño de las cotas ANCHO / ALTO: es la medida principal del vidrio.
    const fd = f * K_GENERAL;
    const pTxt = add(centro, add(mul(u, r * 0.5), mul({ x: -u.y, y: u.x }, -fd * 0.9)));
    ocuparTexto(pTxt, texto, fd);
    elementos.push(
      <g key="diametro" pointerEvents="none">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COTA} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <circle cx={centro.x} cy={centro.y} r={f * 0.15} fill={COTA} />
        <Texto p={pTxt} f={fd} color={TINTA} bold>
          {texto}
        </Texto>
      </g>,
    );
  }

  // ── Esquinas a 90° (desplomes) ─────────────────────────────────────────────
  // En un desplome la diferencia es de unos milímetros en metros de alto: a simple vista no se
  // nota cuál lado va a escuadra. Se marca con el símbolo de ángulo recto + «90°», solo en la
  // parte inferior (decisión del usuario, 2026-10-16). Va en el cruce de los dos lados rectos
  // aunque la esquina tenga despunte o radio: lo que se acota es el ángulo entre los lados.
  if (conCotas) {
    const VECINOS: Record<'ii' | 'id', ['id' | 'ii', 'si' | 'sd']> = { ii: ['id', 'si'], id: ['ii', 'sd'] };
    for (const e of esquinas90Inferiores(pieza)) {
      const V = v[e];
      const d1 = unit(sub(v[VECINOS[e][0]], V));
      const d2 = unit(sub(v[VECINOS[e][1]], V));
      const s = f * 1.0;
      const p1 = add(V, mul(d1, s));
      const p3 = add(V, mul(d2, s));
      const p2 = add(p1, mul(d2, s));
      elementos.push(
        <g key={'r90' + e}>
          <polyline points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="none" stroke={TINTA} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* El texto va por fuera, en diagonal bajo la esquina: por dentro chocaba con la etiqueta
              de las muescas de piso. Ahí no pasan las líneas auxiliares del ancho ni del alto. */}
          <Texto p={add(V, add(mul(d1, -f * 1.5), mul(d2, -f * 0.9)))} f={fc} bold>
            90°
          </Texto>
        </g>,
      );
    }
  }

  // ── Notas y sello ──────────────────────────────────────────────────────────
  if (conCotas) {
    for (const o of pieza.operaciones) {
      if (o.tipo !== 'nota' || !o.texto) continue;
      const p = { x: caja.minX + (W * o.x) / 100, y: caja.minY + (H * o.y) / 100 };
      elementos.push(
        <g key={o.id} onPointerDown={alPresionar(o.id)} style={interaccion ? { cursor: interaccion.arrastrando ? 'grabbing' : 'move' } : undefined}>
          {sel.has(o.id) && (
            <rect
              x={p.x - anchoTexto(o.texto, f * 0.9) / 2}
              y={p.y - f * 0.8}
              width={anchoTexto(o.texto, f * 0.9)}
              height={f * 1.6}
              fill="rgba(21,101,192,.08)"
              stroke={ACENTO}
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              className="solo-pantalla"
            />
          )}
          <Texto p={p} f={f * 0.9} bold color={destacado(o.id) ? ACENTO : TINTA}>
            {o.texto}
          </Texto>
        </g>,
      );
    }
    if (selloEnCanto) {
      elementos.push(
        <Texto key="sello" p={{ x: centro.x, y: caja.minY + H * 0.62 }} f={f * 0.9} bold>
          SELLO EN EL CANTO
        </Texto>,
      );
    }
  }

  // ── Número de cada detalle ─────────────────────────────────────────────────
  // Va junto a la zona, en el primer sitio libre (se ubica al final: las cotas mandan), con una línea
  // corta hasta ella. No reemplaza ninguna cota: el detalle repite y amplía las mismas cifras.
  if (conCotas) {
    const esquinasVisuales = esquinasDe(piezaVisual);
    for (const z of zonas) {
      const e0 = z.elementos[0];
      const tv = e0.tipo === 'muesca' ? esquinasVisuales[e0.esquina] : null;
      const ancla = e0.tipo === 'muesca' && tv?.tipo === 'muesca' ? geometriaMuesca(e0.esquina, v, bs, tv).p2 : z.ancla;
      const r = f * 0.55;
      const base = unit(sub(ancla, centro));
      const giro = (k: number) => {
        const a = (k * Math.PI) / 180;
        return { x: base.x * Math.cos(a) - base.y * Math.sin(a), y: base.x * Math.sin(a) + base.y * Math.cos(a) };
      };
      const candidatos = [0, 35, -35, 70, -70, 110, -110, 180].flatMap((k) => [2.2, 3.4].map((d) => add(ancla, mul(giro(k), f * d))));
      const cajaB = (p: Pt) => ({ x1: p.x - r * 1.2, y1: p.y - r * 1.2, x2: p.x + r * 1.2, y2: p.y + r * 1.2 });
      // La línea hasta la zona tampoco debe cruzar un número; si ningún sitio lo logra, basta con que el círculo quede libre.
      const tramo = (q: Pt) => add(q, mul(unit(sub(ancla, q)), r));
      const p = candidatos.find((q) => espacio.libre(cajaB(q)) && !espacio.tapaTexto(ancla, tramo(q))) ?? candidatos.find((q) => espacio.libre(cajaB(q))) ?? candidatos[0];
      espacio.ocupar(cajaB(p));
      const u = unit(sub(ancla, p));
      elementos.push(
        <g key={'zona' + z.numero} pointerEvents="none">
          <line x1={ancla.x} y1={ancla.y} x2={p.x + u.x * r} y2={p.y + u.y * r} stroke={TINTA} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          <circle cx={ancla.x} cy={ancla.y} r={f * 0.08} fill={TINTA} />
          <circle cx={p.x} cy={p.y} r={r} fill="#fff" stroke={TINTA} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <Texto p={p} f={f * 0.7} bold>
            {z.numero}
          </Texto>
        </g>,
      );
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      ref={interaccion?.svgRef}
      onPointerDown={interaccion?.onPointerDownFondo}
      style={interaccion ? { touchAction: 'none', userSelect: 'none' } : undefined}
    >
      <path d={path} fill={VIDRIO} stroke={TINTA} strokeWidth={conCotas ? 1.8 : 1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {elementos}
      {generales}
      {zonas.length > 0 && <DetallesSVG pieza={pieza} zonas={zonas} celdas={celdas} f={f} />}
      {numeros}
    </svg>
  );
}
