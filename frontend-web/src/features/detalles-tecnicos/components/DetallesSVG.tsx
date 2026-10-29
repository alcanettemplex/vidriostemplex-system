import { useId, type ReactNode } from 'react';
import type { CeldaDetalle, ZonaDetalle } from '../modelo/detalles';
import {
  add,
  bordesDe,
  centroPerforacion,
  contornoDe,
  esquinasDe,
  geometriaAlivios,
  geometriaBoquete,
  geometriaMediaPerforacion,
  geometriaMuesca,
  limitesDe,
  mul,
  pathDe,
  sub,
  unit,
  verticesBase,
  type Pt,
} from '../modelo/geometria';
import type { Perforacion, Pieza } from '../modelo/tipos';
import { cajaEtiqueta, COTA, colocarCota, crearColocador, DibujoCota, fmt, ladoHacia, Texto, TINTA, VIDRIO, type CotaProps } from './cotas';

// Detalles ampliados de la hoja (2026-10-29, diseño 2 elegido por el usuario). Cada cuadro muestra
// una zona del vidrio a escala mayor y REPITE las cifras del plano principal: no reemplaza ninguna.
// Las zonas y el lugar de cada cuadro los decide `modelo/detalles.ts`; aquí solo se dibujan.

interface Props {
  pieza: Pieza;
  zonas: ZonaDetalle[];
  celdas: CeldaDetalle[];
  /** Tamaño de letra del plano principal: los detalles se leen al mismo tamaño. */
  f: number;
}

export function DetallesSVG({ pieza, zonas, celdas, f }: Props) {
  // Ids únicos por plano: «Imprimir pedido» pone varias hojas en el mismo documento y un clipPath
  // repetido recortaría con el de la primera.
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <g pointerEvents="none">
      {zonas.map((z, i) => (
        <Detalle key={z.numero} pieza={pieza} zona={z} celda={celdas[i]} f={f} clipId={`dt${base}z${z.numero}`} />
      ))}
    </g>
  );
}

function Detalle({ pieza, zona, celda, f, clipId }: { pieza: Pieza; zona: ZonaDetalle; celda: CeldaDetalle; f: number; clipId: string }) {
  const v = verticesBase(pieza);
  const bs = bordesDe(v);
  const L = limitesDe(v);
  const fc = f * 0.8;
  const banda = f * 2;
  const pad = f * 2.4;
  const area = { x: celda.x + pad, y: celda.y + banda + pad * 0.5, w: celda.w - 2 * pad, h: celda.h - banda - pad };
  const zw = zona.caja.maxX - zona.caja.minX;
  const zh = zona.caja.maxY - zona.caja.minY;
  const k = Math.max(Math.min(area.w / zw, area.h / zh), 1e-6);
  const zc = { x: (zona.caja.minX + zona.caja.maxX) / 2, y: (zona.caja.minY + zona.caja.maxY) / 2 };
  const ac = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  /** De milímetros del vidrio a la posición dentro del cuadro. */
  const P = (p: Pt): Pt => ({ x: ac.x + (p.x - zc.x) * k, y: ac.y + (p.y - zc.y) * k });
  const ventana = { x: ac.x - (zw * k) / 2, y: ac.y - (zh * k) / 2, w: zw * k, h: zh * k };
  const centroVidrio = P({ x: (v.si.x + v.sd.x + v.id.x + v.ii.x) / 4, y: (v.si.y + v.sd.y + v.id.y + v.ii.y) / 4 });

  const espacio = crearColocador();
  // Los números no cruzan el marco ni el canto del vidrio dentro de la ventana.
  const esquinasMarco = [
    { x: celda.x, y: celda.y },
    { x: celda.x + celda.w, y: celda.y },
    { x: celda.x + celda.w, y: celda.y + celda.h },
    { x: celda.x, y: celda.y + celda.h },
  ];
  esquinasMarco.forEach((p, i) => espacio.linea(p, esquinasMarco[(i + 1) % 4]));
  const contorno = contornoDe(pieza).map(P);
  contorno.forEach((p, i) => espacio.linea(p, contorno[(i + 1) % contorno.length]));
  const titulo = { x: celda.x + f * 0.6, y: celda.y + banda / 2 };
  espacio.ocupar(cajaEtiqueta(titulo, `DETALLE ${zona.numero}`, f * 0.85, 'start'));

  const cotas: ReactNode[] = [];
  const cota = (key: string, p: CotaProps) => {
    const c = colocarCota(espacio, p, ac);
    if (c) cotas.push(<DibujoCota key={key} a={p.a} b={p.b} texto={p.texto} f={p.f} bold={p.bold} c={c} />);
  };
  const aux = (a: Pt, b: Pt, key: string, punteada = true) => {
    espacio.linea(a, b);
    cotas.push(<line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COTA} strokeWidth={0.5} strokeDasharray={punteada ? '2 2' : undefined} vectorEffect="non-scaling-stroke" />);
  };
  const etiqueta = (key: string, cerca: Pt, texto: string, dirs: Pt[]) => {
    const candidatos = [1.6, 2.6, 3.8].flatMap((s) => dirs.map((d) => add(cerca, mul(d, f * s))));
    const p = candidatos.find((q) => espacio.libre(cajaEtiqueta(q, texto, fc))) ?? candidatos[0];
    espacio.ocupar(cajaEtiqueta(p, texto, fc));
    cotas.push(
      <Texto key={key} p={p} f={fc} bold>
        {texto}
      </Texto>,
    );
  };

  const perfs = pieza.operaciones.filter((o): o is Perforacion => o.tipo === 'perforacion');
  const rVisual = (d: number) => Math.max((d / 2) * k, f * 0.22);
  const esquinas = esquinasDe(pieza);

  // Perforaciones que se ven en el cuadro (las de la zona y cualquier otra que caiga dentro).
  const dibujoPerfs: ReactNode[] = [];
  perfs.forEach((o) => {
    const c = P(centroPerforacion(pieza, o, v));
    const r = rVisual(o.d);
    if (c.x + r < ventana.x || c.x - r > ventana.x + ventana.w || c.y + r < ventana.y || c.y - r > ventana.y + ventana.h) return;
    espacio.ocupar({ x1: c.x - r * 1.5, y1: c.y - r * 1.5, x2: c.x + r * 1.5, y2: c.y + r * 1.5 });
    dibujoPerfs.push(
      <g key={o.id}>
        <circle cx={c.x} cy={c.y} r={r} fill="#fff" stroke={TINTA} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        <line x1={c.x - r * 1.5} y1={c.y} x2={c.x + r * 1.5} y2={c.y} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        <line x1={c.x} y1={c.y - r * 1.5} x2={c.x} y2={c.y + r * 1.5} stroke={COTA} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      </g>,
    );
  });

  for (const el of zona.elementos) {
    if (el.tipo === 'muesca') {
      const t = esquinas[el.esquina];
      if (t.tipo !== 'muesca') continue;
      const g = geometriaMuesca(el.esquina, v, bs, t);
      const [V, p1, p2, p3] = [g.V, g.p1, g.p2, g.p3].map(P);
      // Los cantos que la muesca quita, punteados: de ahí se miden las perforaciones vecinas.
      aux(V, p1, el.esquina + 'g1');
      aux(V, p3, el.esquina + 'g2');
      const hacia = (a: Pt, b: Pt) => ladoHacia(a, b, sub(centroVidrio, mul(add(a, b), 0.5)));
      cota(el.esquina + 'm1', { a: p1, b: p2, texto: fmt(g.lOut), f: fc, lado: hacia(p1, p2) });
      cota(el.esquina + 'm2', { a: p2, b: p3, texto: fmt(g.lIn), f: fc, lado: hacia(p2, p3) });
    } else if (el.tipo === 'perforacion') {
      const o = perfs.find((x) => x.id === el.id);
      if (!o) continue;
      const cm = centroPerforacion(pieza, o, v);
      const c = P(cm);
      const r = rVisual(o.d);
      // Horizontal: del canto de referencia al centro, entre la perforación y su canto superior/inferior.
      if (o.refX !== 'centro') {
        const xe = P({ x: o.refX === 'izq' ? L.xIzq(cm.y) : L.xDer(cm.y), y: cm.y }).x;
        const s = o.refY === 'inf' ? 1 : -1;
        const y = c.y + s * (r + f * 1.1);
        const a = { x: xe, y };
        const b = { x: c.x, y };
        aux({ x: c.x, y: c.y + s * r }, { x: c.x, y: y + s * f * 0.3 }, o.id + 'eh', false);
        cota(o.id + 'h', { a, b, texto: fmt(o.x), f: fc, lado: ladoHacia(a, b, { x: 0, y: s }) });
      }
      // Vertical: del canto superior/inferior al centro, del lado opuesto a su canto de referencia.
      if (o.refY !== 'centro') {
        const ye = P({ x: cm.x, y: o.refY === 'sup' ? L.ySup(cm.x) : L.yInf(cm.x) }).y;
        const s = o.refX === 'der' ? -1 : 1;
        const x = c.x + s * (r + f * 1.1);
        const a = { x, y: ye };
        const b = { x, y: c.y };
        aux({ x: c.x + s * r, y: c.y }, { x: x + s * f * 0.3, y: c.y }, o.id + 'ev', false);
        cota(o.id + 'v', { a, b, texto: fmt(o.y), f: fc, lado: ladoHacia(a, b, { x: s, y: 0 }) });
      }
      etiqueta(o.id + 'l', c, `PERF. Ø${fmt(o.d)} mm`, [unit(sub(c, centroVidrio)), { x: 0, y: 1 }, { x: 0, y: -1 }].map((d) => mul(d, 1 + r / f)));
    } else if (el.tipo === 'boquete') {
      const o = pieza.operaciones.find((x) => x.id === el.id);
      if (!o || o.tipo !== 'boquete') continue;
      const borde = bs[o.borde];
      const g = geometriaBoquete(o, borde);
      const [A, B, C, D] = [g.A, g.B, g.C, g.D].map(P);
      // Ranura «ojo» (abre una perforación al canto): como en el plano principal, solo su ancho; el
      // fondo lo da la perforación, que tiene sus propias cotas.
      const r = (q: Perforacion) => q.d / 2;
      const esOjo = !o.alivio && perfs.some((q) => {
        const c = centroPerforacion(pieza, q, v);
        const xs = [g.A.x, g.B.x, g.C.x, g.D.x];
        const ys = [g.A.y, g.B.y, g.C.y, g.D.y];
        return c.x >= Math.min(...xs) - r(q) && c.x <= Math.max(...xs) + r(q) && c.y >= Math.min(...ys) - r(q) && c.y <= Math.max(...ys) + r(q);
      });
      if (esOjo) {
        const fuera = mul(borde.n, -f * 1.6);
        const a = add(A, fuera);
        const b = add(D, fuera);
        aux(A, add(a, mul(borde.n, -f * 0.3)), o.id + 'oa', false);
        aux(D, add(b, mul(borde.n, -f * 0.3)), o.id + 'ob', false);
        cota(o.id + 'ow', { a, b, texto: fmt(o.largo), f: fc, lado: ladoHacia(a, b, mul(borde.n, -1)) });
        continue;
      }
      const sep = fc * 1.1;
      const lat = mul(borde.d, -sep);
      const fa = add(A, lat);
      const fb = add(B, lat);
      const la = add(B, mul(borde.n, sep));
      const lb = add(C, mul(borde.n, sep));
      aux(B, add(fb, mul(borde.d, -f * 0.3)), o.id + 'ef', false);
      cota(o.id + 'fo', { a: fa, b: fb, texto: fmt(o.prof), f: fc, lado: ladoHacia(fa, fb, mul(borde.d, -1)) });
      aux(B, add(la, mul(borde.n, f * 0.3)), o.id + 'el', false);
      aux(C, add(lb, mul(borde.n, f * 0.3)), o.id + 'em', false);
      cota(o.id + 'la', { a: la, b: lb, texto: fmt(o.largo), f: fc, lado: ladoHacia(la, lb, borde.n) });
      const al = geometriaAlivios(o, borde);
      const medio = mul(add(B, C), 0.5);
      if (al && 'pts' in al) {
        const ladoA = mul(borde.d, -1);
        const a = add(A, mul(ladoA, al.r * k + sep * 2.2));
        const b = add(a, mul(borde.n, o.alivio!.fondo * k));
        cota(o.id + 'fa', { a, b, texto: fmt(o.alivio!.fondo), f: fc, lado: ladoHacia(a, b, ladoA) });
        etiqueta(o.id + 'al', medio, `ALIVIOS Ø${fmt(o.alivio!.d)}`, [borde.n, add(borde.n, borde.d), add(borde.n, mul(borde.d, -1))].map((d) => mul(unit(d), 2)));
      } else if (o.radio > 0) {
        // Radio: línea del centro del redondeo a la curva, a 45°, con su valor.
        const rr = Math.min(o.radio, o.largo / 2, o.prof) * k;
        const cr = add(add(C, mul(borde.n, -rr)), mul(borde.d, -rr));
        const u = unit(add(borde.n, borde.d));
        const enCurva = add(cr, mul(u, rr));
        cotas.push(
          <g key={o.id + 'r'}>
            <line x1={cr.x} y1={cr.y} x2={enCurva.x} y2={enCurva.y} stroke={COTA} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            <circle cx={cr.x} cy={cr.y} r={f * 0.08} fill={COTA} />
          </g>,
        );
        espacio.linea(cr, enCurva);
        etiqueta(o.id + 'rl', enCurva, `R${fmt(o.radio)}`, [u, mul(borde.d, -1), mul(borde.n, -1)]);
      }
    } else {
      const o = pieza.operaciones.find((x) => x.id === el.id);
      if (!o || o.tipo !== 'media-perforacion') continue;
      const borde = bs[o.borde];
      const g = geometriaMediaPerforacion(o, borde);
      const fuera = mul(borde.n, -f * 1.4);
      const a = add(P(g.A), fuera);
      const b = add(P(g.D), fuera);
      aux(P(g.A), add(a, mul(borde.n, -f * 0.3)), o.id + 'ea', false);
      aux(P(g.D), add(b, mul(borde.n, -f * 0.3)), o.id + 'eb', false);
      cota(o.id + 'd', { a, b, texto: `Ø${fmt(o.d)}`, f: fc, lado: ladoHacia(a, b, mul(borde.n, -1)) });
      etiqueta(o.id + 'l', P(g.C), '½ PERF.', [borde.n].map((d) => mul(d, 1 + g.r * k / f)));
    }
  }

  return (
    <g>
      <rect x={celda.x} y={celda.y} width={celda.w} height={celda.h} fill="#fff" stroke={TINTA} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <Texto p={titulo} f={f * 0.85} anchor="start" bold>
        {`DETALLE ${zona.numero}`}
      </Texto>
      <Texto p={{ x: celda.x + celda.w - f * 0.6, y: titulo.y }} f={f * 0.6} anchor="end">
        SIN ESCALA
      </Texto>
      <clipPath id={clipId}>
        <rect x={ventana.x} y={ventana.y} width={ventana.w} height={ventana.h} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${ac.x - zc.x * k} ${ac.y - zc.y * k}) scale(${k})`}>
          <path d={pathDe(contornoDe(pieza))} fill={VIDRIO} stroke={TINTA} strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
        {dibujoPerfs}
      </g>
      {cotas}
    </g>
  );
}
