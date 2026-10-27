import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import {
  add,
  BORDE_ENTRADA,
  BORDE_SALIDA,
  bordeCurvo,
  bordesDe,
  centroPerforacion,
  contornoDe,
  encuadre,
  esCirculo,
  esHorizontal,
  esquinasDe,
  geometriaAlivios,
  geometriaBoquete,
  geometriaMediaPerforacion,
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
  type Pt,
} from '../modelo/geometria';
import type { Boquete, Perforacion, Pieza } from '../modelo/tipos';

// Estilo «calco del taller» (propuesta 6, 2026-10-27): vidrio en blanco, todo en tinta negra, remates
// rectos y ANCHO / ALTO en negrita y más grandes, como el plano que dibuja el taller a mano. El azul
// (ACENTO) queda solo para la selección del editor: la imagen que se exporta no lo lleva.
const TINTA = '#111';
const COTA = '#111';
const VIDRIO = '#fff';
const ACENTO = '#1565c0';
const SUAVE = '#6b7280';

const fmt = (n: number) => String(Math.round(n * 10) / 10);
/** Ancho aproximado que ocupa un texto de cota (Arial), en las mismas unidades que `f`. */
const anchoTexto = (texto: string, f: number) => texto.length * f * 0.6 + f * 0.5;
/** Tamaño de las cotas generales (ANCHO, ALTO, Ø del círculo): las que más se leen del plano. */
const K_GENERAL = 1.3;

interface CotaProps {
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
}

/** Rectángulo alineado a los ejes, en unidades del plano. */
interface Caja {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** ¿El segmento a–b pasa por la caja? (Liang–Barsky) */
function cruzaCaja(a: Pt, b: Pt, c: Caja): boolean {
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
function crearColocador() {
  const cajas: Caja[] = [];
  const lineas: [Pt, Pt][] = [];
  return {
    libre: (c: Caja) => cajas.every((o) => c.x2 <= o.x1 || c.x1 >= o.x2 || c.y2 <= o.y1 || c.y1 >= o.y2) && lineas.every(([a, b]) => !cruzaCaja(a, b, c)),
    ocupar: (c: Caja) => void cajas.push(c),
    linea: (a: Pt, b: Pt) => void lineas.push([a, b]),
  };
}
type Colocador = ReturnType<typeof crearColocador>;

/** Caja de un texto de ancho `w` y alto `h` centrado en `p` y girado `ang` grados. */
function cajaTexto(p: Pt, w: number, h: number, ang = 0): Caja {
  const r = (ang * Math.PI) / 180;
  const ex = (Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * h) / 2;
  const ey = (Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * h) / 2;
  return { x1: p.x - ex, y1: p.y - ey, x2: p.x + ex, y2: p.y + ey };
}

/** Caja de un `<Texto>` según su `anchor`. */
function cajaEtiqueta(p: Pt, texto: string, f: number, anchor: 'start' | 'middle' | 'end' = 'middle'): Caja {
  const w = anchoTexto(texto, f);
  const cx = anchor === 'start' ? p.x + w / 2 - f * 0.25 : anchor === 'end' ? p.x - w / 2 + f * 0.25 : p.x;
  return cajaTexto({ x: cx, y: p.y }, w, f);
}

interface Colocacion {
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
function colocarCota(col: Colocador, { a, b, texto, f, lado = 1, t = 0.5, bold }: CotaProps, centro: Pt): Colocacion | null {
  const L = largo(sub(b, a));
  if (L < 1e-6) return null;
  const d = unit(sub(b, a));
  const n = { x: -d.y, y: d.x };
  let angLinea = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (angLinea > 90.1) angLinea -= 180;
  if (angLinea <= -90.1) angLinea += 180;
  const w = anchoTexto(texto, f) * (bold ? 1.1 : 1);
  const h = f;
  // Cabe si la línea es al menos tan larga como las cifras (sin el margen que lleva `anchoTexto`).
  const cabe = L >= texto.length * f * 0.55 + f * 0.1;
  const candidatos: Colocacion[] = [];
  const enLinea = (tt: number, ld: number) => {
    const base = add(a, mul(d, L * tt));
    const tp = add(base, mul(n, ld * f * 0.75));
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
function DibujoCota({ a, b, texto, f, color = COTA, bold, c }: Pick<CotaProps, 'a' | 'b' | 'texto' | 'f' | 'color' | 'bold'> & { c: Colocacion }) {
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

function Texto({ p, children, f, anchor = 'middle', bold, color = TINTA }: { p: Pt; children: ReactNode; f: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; color?: string }) {
  return (
    <text x={p.x} y={p.y} fontSize={f} fill={color} textAnchor={anchor} dominantBaseline="central" fontFamily="Arial, sans-serif" fontWeight={bold ? 700 : 400}>
      {children}
    </text>
  );
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
  const { v, caja, W, H, m, f, M, anchoTotal, altoTotal } = encuadre(pieza, conCotas);
  const viewBox = `${caja.minX - M} ${caja.minY - M} ${anchoTotal} ${altoTotal}`;
  const centro = { x: (caja.minX + caja.maxX) / 2, y: (caja.minY + caja.maxY) / 2 };
  const bs = bordesDe(v);
  const L = limitesDe(v);
  const contorno = contornoDe(pieza);
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

  /**
   * Distancia (por fuera del vidrio) de la línea más externa de cotas de perforaciones en cada canto
   * vertical. La cota de posición de un boquete de ese canto va una línea más afuera: antes iban casi
   * en la misma línea (1,3 f y 1,4 f) y se leían pegadas, p. ej. «800 1000».
   */
  const carrilPerf: Partial<Record<'izq' | 'der', number>> = {};
  if (conCotas) {
    const ext = lineaAux;
    const cadena = (dists: number[]) => Array.from(new Set(dists.map((d) => Math.round(d * 10) / 10))).sort((a, b) => a - b);
    const gap = fc * 0.35;
    /** Dibuja una cadena de cotas encadenadas desde un borde: `punto(s)` da la posición a distancia s. */
    const dibujarCadena = (k: string, dists: number[], punto: (s: number) => Pt, lado: number) => {
      const tramos = dists.map((d, j) => {
        const ini = j === 0 ? 0 : dists[j - 1];
        return { ini, fin: d, ancho: anchoTexto(fmt(d - ini), fc) };
      });
      const pos = repartir(tramos, gap);
      tramos.forEach((tr, j) => {
        const t = (pos[j] - tr.ini) / (tr.fin - tr.ini);
        elementos.push(cota(`${k}${j}`, { a: punto(tr.ini), b: punto(tr.fin), texto: fmt(tr.fin - tr.ini), f: fc, lado, t }));
      });
    };

    // Verticales: fuera del vidrio, del lado de su referencia, encadenadas desde el borde.
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
      const off = f * (solapa ? 2.4 : 1.3);
      carrilPerf[g.lado] = Math.max(carrilPerf[g.lado] ?? 0, off);
      const xLinea = g.lado === 'izq' ? caja.minX - off : caja.maxX + off;
      const esq = g.ref === 'sup' ? (g.lado === 'izq' ? v.si : v.sd) : g.lado === 'izq' ? v.ii : v.id;
      const sgn = g.ref === 'sup' ? 1 : -1;
      dibujarCadena(`${k}v`, cadena(g.idx.map((i) => perfs[i].y)), (s) => ({ x: xLinea, y: esq.y + sgn * s }), -sgn * (g.lado === 'izq' ? -1 : 1));
      // Una sola línea auxiliar por altura: desde la perforación más cercana a ese lado.
      const porAltura = new Map<number, number>();
      for (const i of g.idx) {
        const k2 = Math.round(perfs[i].y * 10);
        const actual = porAltura.get(k2);
        const masCerca = (a: number, b: number) => (g.lado === 'izq' ? centros[a].x < centros[b].x : centros[a].x > centros[b].x);
        if (actual === undefined || masCerca(i, actual)) porAltura.set(k2, i);
      }
      for (const i of Array.from(porAltura.values())) {
        const c = centros[i];
        const r = rVisual(perfs[i].d);
        elementos.push(ext({ x: c.x + (g.lado === 'izq' ? -r : r), y: c.y }, { x: xLinea + (g.lado === 'izq' ? -1 : 1) * f * 0.3, y: c.y }, `${k}e${i}`));
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
      const x = c.x + dir * (rVisual(d) + f * 0.9);
      const texto = `${idx.length > 1 ? idx.length + ' ' : ''}PERF. Ø${d} mm`;
      const anchor = dir > 0 ? 'start' : 'end';
      const candidatos = [3.4, -1.6, 5, -3.2, 6.6].map((k) => ({ x, y: c.y + vert * f * k }));
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
    const pLbl = add(inward, mul(borde.n, f * 1.3));
    const anchor = Math.abs(borde.n.x) > 0.5 ? (borde.n.x < 0 ? 'end' : 'start') : 'middle';
    const al = geometriaAlivios(o, borde);
    const conAlivio = !!al && 'pts' in al;
    const etiqueta = conAlivio ? `BOQ ${o.largo}×${o.prof} · ALIVIOS Ø${fmt(o.alivio!.d)}` : `BOQ ${o.largo}×${o.prof}${o.radio ? ` R${o.radio}` : ''}`;
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
    ocuparTexto(pLbl, etiqueta, fc, anchor);
    if (conAlivio) {
      // Fondo de los alivios: del canto al punto más profundo, junto al alivio del lado A.
      const lateral = mul(borde.d, -(al.r + fc * 1.2));
      const a = add(g.A, lateral);
      const b = add(a, mul(borde.n, o.alivio!.fondo));
      elementos.push(
        cota(o.id + 'f', { a, b, texto: fmt(o.alivio!.fondo), f: fc, lado: 1, color: col, t: o.alivio!.fondo < anchoTexto(fmt(o.alivio!.fondo), fc) + fc ? 1.8 : 0.5 }),
      );
    }
    elementos.push(
      <Texto key={o.id + 'l'} p={pLbl} f={fc} anchor={anchor} color={col} bold={activo}>
        {etiqueta}
      </Texto>,
    );
    if (o.pos > 0) {
      // Si el canto ya tiene una cadena de cotas de perforaciones, esta va una línea más afuera.
      const carril = o.borde === 'izq' || o.borde === 'der' ? carrilPerf[o.borde] : undefined;
      const dist = carril ? carril + f * 1.2 : f * 1.4;
      const off = mul(borde.n, -dist);
      const origen = origenBoquete(o, borde);
      const ini = add(origen, off);
      const desdeS = largo(sub(origen, borde.S)) < 1e-6;
      const fin = add(desdeS ? g.A : g.D, off);
      if (carril) elementos.push(lineaAux(origen, add(ini, mul(borde.n, -f * 0.3)), o.id + 'eo'), lineaAux(desdeS ? g.A : g.D, add(fin, mul(borde.n, -f * 0.3)), o.id + 'ep'));
      const dd = unit(sub(fin, ini));
      const nn = { x: -dd.y, y: dd.x };
      const lado = nn.x * -borde.n.x + nn.y * -borde.n.y > 0 ? 1 : -1;
      // Si la distancia es corta, el número se corre hacia el boquete para que no choque con la esquina.
      const w = anchoTexto(fmt(o.pos), fc);
      const t = o.pos < w + fc ? (w / 2 + fc * 0.4) / o.pos + 1 : 0.5;
      elementos.push(cota(o.id + 'p', { a: ini, b: fin, texto: fmt(o.pos), f: fc, lado, color: col, t }));
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
    for (const e of ORDEN_ESQUINAS) {
      const t = esquinas[e];
      if (t.tipo === 'recta') continue;
      const V = v[e];
      if (t.tipo === 'muesca') {
        // Cotas sobre los dos lados interiores del recorte, como en la hoja «BOQUETE».
        const dIn = bs[BORDE_ENTRADA[e]].d;
        const dOut = bs[BORDE_SALIDA[e]].d;
        const lIn = esHorizontal(BORDE_ENTRADA[e]) ? t.a : t.b;
        const lOut = esHorizontal(BORDE_SALIDA[e]) ? t.a : t.b;
        const p1 = add(V, mul(dIn, -lIn));
        const p2 = add(p1, mul(dOut, lOut));
        const p3 = add(V, mul(dOut, lOut));
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
      {numeros}
    </svg>
  );
}
