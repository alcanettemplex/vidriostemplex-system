import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import {
  add,
  BORDE_ENTRADA,
  BORDE_SALIDA,
  bordesDe,
  centroPerforacion,
  contornoDe,
  encuadre,
  esHorizontal,
  geometriaBoquete,
  largo,
  limitesDe,
  mul,
  ORDEN_ESQUINAS,
  origenBoquete,
  pathDe,
  sub,
  unit,
  type Pt,
} from '../modelo/geometria';
import type { Perforacion, Pieza } from '../modelo/tipos';

const TINTA = '#1f2937';
const COTA = '#374151';
const VIDRIO = '#e3f1fa';
const ACENTO = '#1565c0';
const SUAVE = '#6b7280';

const fmt = (n: number) => String(Math.round(n * 10) / 10);
/** Ancho aproximado que ocupa un texto de cota (Arial), en las mismas unidades que `f`. */
const anchoTexto = (texto: string, f: number) => texto.length * f * 0.6 + f * 0.5;

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
}

/** Línea de cota con marcas oblicuas en los extremos y el valor. */
function Cota({ a, b, texto, f, lado = 1, color = COTA, t = 0.5 }: CotaProps) {
  const L = largo(sub(b, a));
  if (L < 1e-6) return null;
  const d = unit(sub(b, a));
  const n = { x: -d.y, y: d.x };
  const tick = mul(unit(add(d, n)), f * 0.35);
  const base = add(a, mul(d, L * t));
  const tp = add(base, mul(n, lado * f * 0.75));
  let ang = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (ang > 90.1) ang -= 180;
  if (ang <= -90.1) ang += 180;
  const prolongacion = t < 0 ? [base, a] : t > 1 ? [b, base] : null;
  return (
    <g stroke={color} fill={color}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {prolongacion && (
        <line x1={prolongacion[0].x} y1={prolongacion[0].y} x2={prolongacion[1].x} y2={prolongacion[1].y} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      )}
      {[a, b].map((p, i) => (
        <line key={i} x1={p.x - tick.x} y1={p.y - tick.y} x2={p.x + tick.x} y2={p.y + tick.y} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      ))}
      <text x={tp.x} y={tp.y} fontSize={f} stroke="none" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, sans-serif" transform={`rotate(${ang} ${tp.x} ${tp.y})`}>
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
  const path = pathDe(contornoDe(pieza));
  const numero = new Map(pieza.operaciones.map((o, i) => [o.id, i + 1]));
  const sel = new Set(seleccionIds);
  const destacado = (id: string) => sel.has(id) || resaltarId === id;
  const agarre = interaccion ? { cursor: interaccion.arrastrando ? 'grabbing' : 'grab' } : undefined;
  const alPresionar = (id: string) => (interaccion ? (e: ReactPointerEvent) => interaccion.onPointerDownOp(id, e) : undefined);

  const perfs = pieza.operaciones.filter((o): o is Perforacion => o.tipo === 'perforacion');
  const centros = perfs.map((o) => centroPerforacion(pieza, o, v));
  const rVisual = (d: number) => Math.max(d / 2, conCotas ? f * 0.28 : m * 0.01);
  const fc = f * 0.8;

  const elementos: ReactNode[] = [];
  const numeros: ReactNode[] = [];
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

  // ── Chaflanes ──────────────────────────────────────────────────────────────
  for (const o of pieza.operaciones) {
    if (o.tipo !== 'chaflan') continue;
    const b = bs[o.borde];
    const w = Math.max(o.ancho, f * 0.5);
    const s = add(b.S, mul(b.n, w));
    const t = add(b.T, mul(b.n, w));
    const pLbl = add(mul(add(b.S, b.T), 0.5), mul(b.n, w + f * 1.1));
    elementos.push(
      <g key={o.id} onPointerDown={alPresionar(o.id)} style={interaccion ? { cursor: 'pointer' } : undefined}>
        {interaccion && <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />}
        <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={ACENTO} strokeDasharray="6 4" strokeWidth={destacado(o.id) ? 2.6 : 1.2} vectorEffect="non-scaling-stroke" />
        {conCotas && (
          <Texto p={pLbl} f={f * 0.85} color={ACENTO}>
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
      elementos.push(<Cota key={o.id + 'x'} a={{ x: Math.min(xRef, c.x), y: c.y }} b={{ x: Math.max(xRef, c.x), y: c.y }} texto={fmt(Math.abs(o.x))} f={fc} lado={-1} color={col} />);
    }
    if (o.refY === 'centro' && o.y !== 0) {
      const yRef = (L.ySup(c.x) + L.yInf(c.x)) / 2;
      elementos.push(<Cota key={o.id + 'y'} a={{ x: c.x, y: Math.min(yRef, c.y) }} b={{ x: c.x, y: Math.max(yRef, c.y) }} texto={fmt(Math.abs(o.y))} f={fc} lado={1} color={col} />);
    }
  });

  if (conCotas) {
    const ext = (a: Pt, b: Pt, k: string) => (
      <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    );
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
        elementos.push(<Cota key={`${k}${j}`} a={punto(tr.ini)} b={punto(tr.fin)} texto={fmt(tr.fin - tr.ini)} f={fc} lado={lado} t={t} />);
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
    for (const [k, idx] of Array.from(filas)) {
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

    // Una etiqueta por diámetro, junto a la primera perforación de ese diámetro.
    const porDiametro = new Map<number, number[]>();
    perfs.forEach((o, i) => porDiametro.set(o.d, [...(porDiametro.get(o.d) ?? []), i]));
    for (const [d, idx] of Array.from(porDiametro)) {
      const c = centros[idx[0]];
      const dir = c.x <= centro.x ? 1 : -1;
      const p = { x: c.x + dir * (rVisual(d) + f * 0.9), y: c.y + (c.y <= centro.y ? 1 : -1) * f * 3.4 };
      elementos.push(
        <Texto key={'lbl' + d} p={p} f={f * 0.85} anchor={dir > 0 ? 'start' : 'end'} bold>
          {`${idx.length > 1 ? idx.length + ' ' : ''}PERF. Ø${d} mm`}
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
    const etiqueta = `BOQ ${o.largo}×${o.prof}${o.radio ? ` R${o.radio}` : ''}`;
    pastilla(o.id, add(inward, mul(borde.n, -f * 1.6)));
    if (!conCotas) continue;
    elementos.push(
      <Texto key={o.id + 'l'} p={pLbl} f={fc} anchor={anchor} color={col} bold={activo}>
        {etiqueta}
      </Texto>,
    );
    if (o.pos > 0) {
      const off = mul(borde.n, -f * 1.4);
      const origen = origenBoquete(o, borde);
      const ini = add(origen, off);
      const desdeS = largo(sub(origen, borde.S)) < 1e-6;
      const fin = add(desdeS ? g.A : g.D, off);
      const dd = unit(sub(fin, ini));
      const nn = { x: -dd.y, y: dd.x };
      const lado = nn.x * -borde.n.x + nn.y * -borde.n.y > 0 ? 1 : -1;
      // Si la distancia es corta, el número se corre hacia el boquete para que no choque con la esquina.
      const w = anchoTexto(fmt(o.pos), fc);
      const t = o.pos < w + fc ? (w / 2 + fc * 0.4) / o.pos + 1 : 0.5;
      elementos.push(<Cota key={o.id + 'p'} a={ini} b={fin} texto={fmt(o.pos)} f={fc} lado={lado} color={col} t={t} />);
    }
  }

  // ── Esquinas ───────────────────────────────────────────────────────────────
  if (conCotas) {
    for (const e of ORDEN_ESQUINAS) {
      const t = pieza.esquinas[e];
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
          <Cota key={e + 'm1'} a={p1} b={p2} texto={fmt(lOut)} f={fc} lado={lado(p1, p2)} />,
          <Cota key={e + 'm2'} a={p2} b={p3} texto={fmt(lIn)} f={fc} lado={lado(p2, p3)} />,
        );
        continue;
      }
      const hacia = unit(sub(centro, V));
      const tam = t.tipo === 'radio' ? t.r : Math.max(t.a, t.b);
      const p = add(V, mul(hacia, tam * 1.2 + f * 2.2));
      elementos.push(
        <Texto key={e} p={p} f={fc} color={COTA}>
          {t.tipo === 'radio' ? `R ${t.r}` : `DESP. ${t.a}×${t.b}`}
        </Texto>,
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

  // ── Cotas generales ────────────────────────────────────────────────────────
  const generales: ReactNode[] = [];
  if (conCotas) {
    const off = f * 3.6;
    const ext = (a: Pt, b: Pt, k: string) => <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
    const yInf = caja.maxY + off;
    generales.push(
      ext({ x: v.ii.x, y: v.ii.y + f * 0.4 }, { x: v.ii.x, y: yInf + f * 0.5 }, 'e1'),
      ext({ x: v.id.x, y: v.id.y + f * 0.4 }, { x: v.id.x, y: yInf + f * 0.5 }, 'e2'),
      <Cota key="ancho" a={{ x: v.ii.x, y: yInf }} b={{ x: v.id.x, y: yInf }} texto={fmt(v.id.x - v.ii.x)} f={f * 1.1} lado={1} color={TINTA} />,
    );
    const xIzq = caja.minX - off;
    generales.push(
      ext({ x: v.si.x - f * 0.4, y: v.si.y }, { x: xIzq - f * 0.5, y: v.si.y }, 'e3'),
      ext({ x: v.ii.x - f * 0.4, y: v.ii.y }, { x: xIzq - f * 0.5, y: v.ii.y }, 'e4'),
      <Cota key="alto" a={{ x: xIzq, y: v.ii.y }} b={{ x: xIzq, y: v.si.y }} texto={fmt(v.ii.y - v.si.y)} f={f * 1.1} lado={-1} color={TINTA} />,
    );
    if (pieza.contorno.tipo === 'desplome-lateral') {
      const ySup = caja.minY - off;
      generales.push(
        ext({ x: v.si.x, y: v.si.y - f * 0.4 }, { x: v.si.x, y: ySup - f * 0.5 }, 'e5'),
        ext({ x: v.sd.x, y: v.sd.y - f * 0.4 }, { x: v.sd.x, y: ySup - f * 0.5 }, 'e6'),
        <Cota key="anchoSup" a={{ x: v.si.x, y: ySup }} b={{ x: v.sd.x, y: ySup }} texto={fmt(v.sd.x - v.si.x)} f={f * 1.1} lado={-1} color={TINTA} />,
      );
    }
    if (pieza.contorno.tipo === 'desplome-superior') {
      const xDer = caja.maxX + off;
      generales.push(
        ext({ x: v.sd.x + f * 0.4, y: v.sd.y }, { x: xDer + f * 0.5, y: v.sd.y }, 'e7'),
        ext({ x: v.id.x + f * 0.4, y: v.id.y }, { x: xDer + f * 0.5, y: v.id.y }, 'e8'),
        <Cota key="altoDer" a={{ x: xDer, y: v.sd.y }} b={{ x: xDer, y: v.id.y }} texto={fmt(v.id.y - v.sd.y)} f={f * 1.1} lado={-1} color={TINTA} />,
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
