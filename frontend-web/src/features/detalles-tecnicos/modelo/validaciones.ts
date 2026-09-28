import {
  bordesDe,
  centroPerforacion,
  espesorNumerico,
  esHorizontal,
  geometriaBoquete,
  largo,
  limitesDe,
  ORDEN_ESQUINAS,
  sub,
  verticesBase,
} from './geometria';
import type { Boquete, Perforacion, Plano } from './tipos';

export type Nivel = 'error' | 'aviso';
export interface Observacion {
  nivel: Nivel;
  texto: string;
  /** Proceso al que se refiere: un clic en el aviso lo selecciona. */
  opId?: string;
}

// Reglas de referencia de la industria del templado. Deben confirmarse con VITELSA / TEMPLACOL
// antes de volverlas bloqueantes; por eso casi todas son avisos y no errores.
export const REGLAS = {
  /** Distancia mínima del borde de la perforación al borde del vidrio, en múltiplos del espesor. */
  distanciaCantoXEspesor: 2,
  /** Distancia mínima entre bordes de dos perforaciones, en múltiplos del espesor. */
  distanciaEntrePerforacionesXEspesor: 2,
  /** Profundidad máxima de un boquete respecto a la medida perpendicular del vidrio. */
  boqueteProfMaxFraccion: 1 / 3,
  anchoMaxMm: 2440,
  altoMaxMm: 3660,
};

export const NOMBRE_ESQUINA = { si: 'de arriba a la izquierda', sd: 'de arriba a la derecha', id: 'de abajo a la derecha', ii: 'de abajo a la izquierda' };
export const NOMBRE_BORDE = { sup: 'superior', der: 'derecho', inf: 'inferior', izq: 'izquierdo' };

export function validarPlano(plano: Plano): Observacion[] {
  const obs: Observacion[] = [];
  const p = plano.pieza;
  const esp = espesorNumerico(plano.espesor);
  const num = (id: string) => p.operaciones.findIndex((o) => o.id === id) + 1;

  if (!(p.ancho > 0) || !(p.alto > 0)) {
    obs.push({ nivel: 'error', texto: 'Falta el ancho o el alto del vidrio.' });
    return obs;
  }
  if (!(plano.cantidad >= 1)) obs.push({ nivel: 'error', texto: 'La cantidad debe ser al menos 1.' });
  if (Math.max(p.ancho, p.alto) > REGLAS.altoMaxMm || Math.min(p.ancho, p.alto) > REGLAS.anchoMaxMm) {
    obs.push({ nivel: 'aviso', texto: `El vidrio mide más de ${REGLAS.anchoMaxMm} × ${REGLAS.altoMaxMm} mm: confirma con el proveedor que lo puede templar.` });
  }
  if (p.contorno.tipo === 'desplome-lateral' && !(p.contorno.anchoSup > 0)) {
    obs.push({ nivel: 'error', texto: 'Falta el ancho de arriba del lado inclinado.' });
  }
  if (p.contorno.tipo === 'desplome-superior' && !(p.contorno.altoLado > 0)) {
    obs.push({ nivel: 'error', texto: 'Falta el alto del lado más bajo.' });
  }

  const v = verticesBase(p);
  const bs = bordesDe(v);
  const L = limitesDe(v);
  const menorLado = Math.min(p.ancho, p.alto);

  for (const e of ORDEN_ESQUINAS) {
    const t = p.esquinas[e];
    if (t.tipo === 'radio' && t.r > menorLado / 2) {
      obs.push({ nivel: 'error', texto: `El radio de la esquina ${NOMBRE_ESQUINA[e]} es mayor que la mitad del lado.` });
    }
    if ((t.tipo === 'despunte' || t.tipo === 'muesca') && (t.a >= p.ancho / 2 || t.b >= p.alto / 2)) {
      const que = t.tipo === 'despunte' ? 'El despunte' : 'El recorte';
      obs.push({ nivel: 'aviso', texto: `${que} de la esquina ${NOMBRE_ESQUINA[e]} ocupa más de la mitad del lado.` });
    }
  }

  const perfs = p.operaciones.filter((o): o is Perforacion => o.tipo === 'perforacion');
  const centros = perfs.map((o) => centroPerforacion(p, o, v));
  // Una perforación que toca un boquete es una cerradura tipo «ojo» (ranura abierta al borde, como en
  // Optiglass): no se le aplica la distancia mínima al borde.
  const cajasBoquete = p.operaciones
    .filter((o): o is Boquete => o.tipo === 'boquete')
    .map((o) => {
      const g = geometriaBoquete(o, bs[o.borde]);
      const xs = [g.A.x, g.B.x, g.C.x, g.D.x];
      const ys = [g.A.y, g.B.y, g.C.y, g.D.y];
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    });
  const minBorde = REGLAS.distanciaCantoXEspesor * esp;
  const minEntre = REGLAS.distanciaEntrePerforacionesXEspesor * esp;

  perfs.forEach((o, i) => {
    const c = centros[i];
    const r = o.d / 2;
    const nombre = `La perforación ${num(o.id)} (Ø${o.d})`;
    if (!(o.d > 0)) {
      obs.push({ nivel: 'error', texto: `A la perforación ${num(o.id)} le falta el diámetro.`, opId: o.id });
      return;
    }
    const tocaBoquete = cajasBoquete.some((k) => c.x + r >= k.minX && c.x - r <= k.maxX && c.y + r >= k.minY && c.y - r <= k.maxY);
    const holgura = Math.min(c.x - L.xIzq(c.y), L.xDer(c.y) - c.x, c.y - L.ySup(c.x), L.yInf(c.x) - c.y) - r;
    if (!tocaBoquete) {
      if (holgura < 0) {
        obs.push({ nivel: 'error', texto: `${nombre} se sale del vidrio o corta el borde.`, opId: o.id });
      } else if (esp > 0 && holgura < minBorde) {
        obs.push({
          nivel: 'aviso',
          texto: `${nombre} queda a ${Math.round(holgura)} mm del borde. Lo recomendado es al menos ${minBorde} mm (2 veces el espesor).`,
          opId: o.id,
        });
      }
    }
    if (esp > 0 && o.d < esp) {
      obs.push({ nivel: 'aviso', texto: `${nombre} es más pequeña que el espesor del vidrio (${plano.espesor} mm): pregunta al proveedor si la puede hacer.`, opId: o.id });
    }
    for (let j = i + 1; j < perfs.length; j++) {
      const gap = largo(sub(c, centros[j])) - r - perfs[j].d / 2;
      if (gap < 0) {
        obs.push({ nivel: 'error', texto: `Las perforaciones ${num(o.id)} y ${num(perfs[j].id)} se montan una sobre otra.`, opId: o.id });
      } else if (esp > 0 && gap < minEntre) {
        obs.push({
          nivel: 'aviso',
          texto: `Las perforaciones ${num(o.id)} y ${num(perfs[j].id)} quedan a ${Math.round(gap)} mm entre sí. Lo recomendado es al menos ${minEntre} mm.`,
          opId: o.id,
        });
      }
    }
  });

  for (const o of p.operaciones) {
    if (o.tipo !== 'boquete') continue;
    const b = bs[o.borde];
    const nombre = `El boquete ${num(o.id)}`;
    if (!(o.largo > 0) || !(o.prof > 0)) {
      obs.push({ nivel: 'error', texto: `A ${nombre.toLowerCase()} le falta el tamaño.`, opId: o.id });
      continue;
    }
    if (o.pos < 0 || o.pos + o.largo > b.L + 0.01) {
      obs.push({ nivel: 'error', texto: `${nombre} se sale del borde ${NOMBRE_BORDE[o.borde]} (el borde mide ${Math.round(b.L)} mm).`, opId: o.id });
    }
    const perpendicular = esHorizontal(o.borde) ? p.alto : p.ancho;
    if (o.prof > perpendicular * REGLAS.boqueteProfMaxFraccion) {
      obs.push({ nivel: 'aviso', texto: `${nombre} entra más de un tercio del vidrio: riesgo de rotura al templar.`, opId: o.id });
    }
  }

  return obs;
}
