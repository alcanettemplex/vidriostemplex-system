import {
  add,
  bordeCurvo,
  bordesDe,
  BORDE_ENTRADA,
  BORDE_SALIDA,
  centroPerforacion,
  contornoDe,
  esCirculo,
  espesorNumerico,
  esHorizontal,
  esquinasDe,
  EXTREMOS,
  geometriaAlivios,
  geometriaBoquete,
  geometriaMediaPerforacion,
  largo,
  mul,
  ORDEN_ESQUINAS,
  puntosSobreArco,
  radioArco,
  sub,
  tramoBoquete,
  unit,
  verticesBase,
  type Pt,
  type Vert,
} from './geometria';
import type { BordeId, Boquete, EsquinaId, MediaPerforacion, Perforacion, Pieza, Plano } from './tipos';

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

// ── Geometría del contorno real ───────────────────────────────────────────────

/** Puntos por semicírculo de una media perforación al pasarla a polígono (error < 0,5 % del radio). */
const PASOS_ARCO = 16;

/** Contorno como polígono: cada esquina redondeada se reemplaza por su cuerda (queda del lado
 *  seguro: la cuerda recorta un poco más que el arco); el semicírculo de una media perforación,
 *  por puntos sobre el arco. */
function poligonoDe(p: Pieza): Pt[] {
  const pts: Vert[] = contornoDe(p);
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    if (P.circ && i > 0) {
      // Arco general (alivios de boquete, contorno en arco): puntos sobre la circunferencia.
      out.push(...puntosSobreArco(pts[i - 1], P.circ, P));
    } else if (P.arco && P.arco > 0 && i > 0) {
      const A = pts[i - 1];
      const u = unit(sub(P, A));
      const hacia = { x: -u.y, y: u.x }; // normal hacia adentro del vidrio
      const C = mul(add(A, P), 0.5);
      for (let k = 1; k <= PASOS_ARCO; k++) {
        const th = (Math.PI * k) / PASOS_ARCO;
        out.push(add(C, add(mul(u, -P.arco * Math.cos(th)), mul(hacia, P.arco * Math.sin(th)))));
      }
    } else if (P.r && P.r > 0) {
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const r = Math.min(P.r, largo(sub(P, prev)) / 2, largo(sub(next, P)) / 2);
      out.push(add(P, mul(unit(sub(prev, P)), r)), add(P, mul(unit(sub(next, P)), r)));
    } else {
      out.push(P);
    }
  }
  return out;
}

function distanciaASegmento(p: Pt, a: Pt, b: Pt) {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 < 1e-9 ? 0 : Math.min(Math.max(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0), 1);
  return largo(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

function dentroDe(p: Pt, poli: Pt[]) {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i];
    const b = poli[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Distancia del borde de la perforación al borde del vidrio. Negativa si corta el borde o
 *  queda fuera, también cuando cae dentro de una muesca o un despunte. */
function holguraPerforacion(c: Pt, r: number, poli: Pt[]) {
  let d = Infinity;
  for (let i = 0; i < poli.length; i++) d = Math.min(d, distanciaASegmento(c, poli[i], poli[(i + 1) % poli.length]));
  return dentroDe(c, poli) ? d - r : -(d + r);
}

/** Cuánto recorta cada esquina del borde `b`, al inicio y al final (recorrido horario). En un
 *  contorno en arco, los cantos vecinos al curvo pierden el radio del arco en ese extremo. */
function recorteEnBorde(b: BordeId, p: Pieza) {
  const esquinas = esquinasDe(p);
  const curvo = bordeCurvo(p);
  const medida = (e: EsquinaId) => {
    if (curvo && curvo !== b && EXTREMOS[curvo].includes(e)) return radioArco(p);
    const t = esquinas[e];
    return t.tipo === 'radio' ? t.r : t.tipo === 'despunte' || t.tipo === 'muesca' ? (esHorizontal(b) ? t.a : t.b) : 0;
  };
  const [eIni, eFin] = EXTREMOS[b];
  // La esquina de inicio es aquella de la que «sale» el borde; la de fin, aquella a la que «entra».
  return {
    ini: BORDE_SALIDA[eIni] === b ? medida(eIni) : 0,
    fin: BORDE_ENTRADA[eFin] === b ? medida(eFin) : 0,
  };
}

/** Tramo del canto que ocupa un boquete, contando lo que sus alivios se abren a cada lado. */
function tramoOcupado(o: Boquete, b: ReturnType<typeof bordesDe>[BordeId]): [number, number] {
  const [t1, t2] = tramoBoquete(o, b);
  const al = geometriaAlivios(o, b);
  const r = al && 'pts' in al ? al.r : 0;
  return [t1 - r, t2 + r];
}

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
  if (esCirculo(p)) {
    if (Math.abs(p.ancho - p.alto) > 0.01) {
      obs.push({ nivel: 'error', texto: `Un círculo mide lo mismo de ancho y de alto (el diámetro): hoy mide ${p.ancho} × ${p.alto} mm.` });
    }
    for (const o of p.operaciones) {
      if (o.tipo === 'boquete' || o.tipo === 'media-perforacion' || o.tipo === 'chaflan') {
        const que = o.tipo === 'boquete' ? 'un boquete' : o.tipo === 'chaflan' ? 'un chaflán' : 'una media perforación';
        obs.push({ nivel: 'error', texto: `En un vidrio circular no se puede hacer ${que}. Quítalo o cambia la forma del vidrio.`, opId: o.id });
      }
    }
  }
  const curvo = bordeCurvo(p);
  if (curvo) {
    const r = radioArco(p);
    const recto = esHorizontal(curvo) ? p.alto : p.ancho;
    if (recto < r - 0.01) {
      obs.push({
        nivel: 'error',
        texto: `El arco no cabe: con el lado curvo ${NOMBRE_BORDE[curvo]} el vidrio debe medir al menos ${Math.round(r * 10) / 10} mm de ${esHorizontal(curvo) ? 'alto' : 'ancho'} (la mitad del lado curvo).`,
      });
    }
    for (const o of p.operaciones) {
      if ((o.tipo === 'boquete' || o.tipo === 'media-perforacion') && o.borde === curvo) {
        obs.push({ nivel: 'error', texto: `El borde ${NOMBRE_BORDE[curvo]} es el arco: ahí no se puede hacer ${o.tipo === 'boquete' ? 'un boquete' : 'una media perforación'}. Pásalo a otro borde.`, opId: o.id });
      }
    }
  }
  // Sin espesor legible no hay cómo medir las distancias mínimas: se dice, en vez de callarlas.
  if (!(esp > 0)) {
    obs.push({ nivel: 'aviso', texto: `No se reconoce el espesor «${plano.espesor || 'vacío'}»: no se revisan las distancias mínimas al borde ni entre perforaciones.` });
  }

  const v = verticesBase(p);
  const bs = bordesDe(v);
  const menorLado = Math.min(p.ancho, p.alto);

  const esquinas = esquinasDe(p);
  for (const e of ORDEN_ESQUINAS) {
    const t = esquinas[e];
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
  const poli = poligonoDe(p);
  // Una perforación que toca un boquete es una cerradura tipo «ojo» (ranura abierta al borde, como en
  // Optiglass): no se le aplica la distancia mínima al borde.
  const cajasBoquete = p.operaciones
    .filter((o): o is Boquete => o.tipo === 'boquete')
    .map((o) => {
      const g = geometriaBoquete(o, bs[o.borde]);
      const al = geometriaAlivios(o, bs[o.borde]);
      // Con alivios, la caja se abre lo que los círculos salen a cada lado y al fondo.
      const pts = [g.A, g.B, g.C, g.D];
      if (al && 'pts' in al) for (const c of al.centros) pts.push(add(c, { x: al.r, y: al.r }), sub(c, { x: al.r, y: al.r }));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
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
    // Herraje estándar (bisagras, rodamientos, Glassvit…): sus cotas y diámetros los fija el
    // fabricante, así que no se le aplican las distancias recomendadas — avisaría en cada
    // corrediza. Que se salga del vidrio o se monte sobre otra sigue siendo error.
    const deHerraje = !!o.grupo;
    const tocaBoquete = cajasBoquete.some((k) => c.x + r >= k.minX && c.x - r <= k.maxX && c.y + r >= k.minY && c.y - r <= k.maxY);
    if (!tocaBoquete) {
      const holgura = holguraPerforacion(c, r, poli);
      if (holgura < 0) {
        obs.push({ nivel: 'error', texto: `${nombre} se sale del vidrio, corta el borde o cae dentro de un recorte.`, opId: o.id });
      } else if (esp > 0 && !deHerraje && holgura < minBorde) {
        obs.push({
          nivel: 'aviso',
          texto: `${nombre} queda a ${Math.round(holgura)} mm del borde. Lo recomendado es al menos ${minBorde} mm (2 veces el espesor).`,
          opId: o.id,
        });
      }
    }
    if (esp > 0 && !deHerraje && o.d < esp) {
      obs.push({ nivel: 'aviso', texto: `${nombre} es más pequeña que el espesor del vidrio (${plano.espesor} mm): pregunta al proveedor si la puede hacer.`, opId: o.id });
    }
    for (let j = i + 1; j < perfs.length; j++) {
      const gap = largo(sub(c, centros[j])) - r - perfs[j].d / 2;
      const mismoHerraje = deHerraje && perfs[j].grupo?.id === o.grupo!.id;
      if (gap < 0) {
        obs.push({ nivel: 'error', texto: `Las perforaciones ${num(o.id)} y ${num(perfs[j].id)} se montan una sobre otra.`, opId: o.id });
      } else if (esp > 0 && !mismoHerraje && gap < minEntre) {
        obs.push({
          nivel: 'aviso',
          texto: `Las perforaciones ${num(o.id)} y ${num(perfs[j].id)} quedan a ${Math.round(gap)} mm entre sí. Lo recomendado es al menos ${minEntre} mm.`,
          opId: o.id,
        });
      }
    }
  });

  const boquetes = p.operaciones.filter((o): o is Boquete => o.tipo === 'boquete');
  for (const o of boquetes) {
    const b = bs[o.borde];
    const nombre = `El boquete ${num(o.id)}`;
    if (!(o.largo > 0) || !(o.prof > 0)) {
      obs.push({ nivel: 'error', texto: `A ${nombre.toLowerCase()} le falta el tamaño.`, opId: o.id });
      continue;
    }
    if (o.pos < 0 || o.pos + o.largo > b.L + 0.01) {
      obs.push({ nivel: 'error', texto: `${nombre} se sale del borde ${NOMBRE_BORDE[o.borde]} (el borde mide ${Math.round(b.L)} mm).`, opId: o.id });
    } else {
      // El tramo útil del borde es el que dejan libre los cortes de sus dos esquinas.
      const [t1, t2] = tramoOcupado(o, b);
      const recorte = recorteEnBorde(o.borde, p);
      if (t1 < recorte.ini - 0.01 || t2 > b.L - recorte.fin + 0.01) {
        obs.push({ nivel: 'error', texto: `${nombre} se mete en el corte de una esquina del borde ${NOMBRE_BORDE[o.borde]}.`, opId: o.id });
      }
    }
    const perpendicular = esHorizontal(o.borde) ? p.alto : p.ancho;
    if (o.prof > perpendicular * REGLAS.boqueteProfMaxFraccion) {
      obs.push({ nivel: 'aviso', texto: `${nombre} entra más de un tercio del vidrio: riesgo de rotura al templar.`, opId: o.id });
    }
    // Alivios: todo aviso, como el resto de reglas que no están confirmadas con el proveedor.
    const al = geometriaAlivios(o, b);
    if (al && 'problema' in al) {
      const del = `del boquete ${num(o.id)}`;
      const texto = {
        'faltan-medidas': `A los alivios ${del} les falta el diámetro o el fondo.`,
        'corta-canto': `Los alivios ${del} cortan el canto: el fondo debe ser mayor que el diámetro.`,
        'no-toca': `Los alivios ${del} quedan más adentro que el fondo del boquete y no lo tocan.`,
        'se-juntan': `Los dos alivios ${del} se juntan en el fondo: el boquete es muy angosto para ese diámetro.`,
      }[al.problema];
      obs.push({ nivel: 'aviso', texto: `${texto} El plano lo muestra sin alivios.`, opId: o.id });
    }
  }
  // Dos boquetes del mismo borde que se traslapan dibujan un contorno que se cruza a sí mismo.
  for (let i = 0; i < boquetes.length; i++) {
    for (let j = i + 1; j < boquetes.length; j++) {
      const a = boquetes[i];
      const b = boquetes[j];
      if (a.borde !== b.borde || !(a.largo > 0) || !(b.largo > 0)) continue;
      const [a1, a2] = tramoOcupado(a, bs[a.borde]);
      const [b1, b2] = tramoOcupado(b, bs[b.borde]);
      if (a1 < b2 && b1 < a2) {
        obs.push({ nivel: 'error', texto: `Los boquetes ${num(a.id)} y ${num(b.id)} se montan uno sobre otro en el borde ${NOMBRE_BORDE[a.borde]}.`, opId: a.id });
      }
    }
  }

  // Medias perforaciones: todo es aviso, ninguna regla impide diseñar (decisión del usuario, 2026-10-19).
  const medias = p.operaciones.filter((o): o is MediaPerforacion => o.tipo === 'media-perforacion');
  const tramosMedia = medias.map((o) => geometriaMediaPerforacion(o, bs[o.borde]));
  medias.forEach((o, i) => {
    const b = bs[o.borde];
    const { t1, t2 } = tramosMedia[i];
    const nombre = `La media perforación ${num(o.id)} (Ø${o.d})`;
    if (!(o.d > 0)) {
      obs.push({ nivel: 'aviso', texto: `A la media perforación ${num(o.id)} le falta el diámetro.`, opId: o.id });
      return;
    }
    const recorte = recorteEnBorde(o.borde, p);
    const libreIni = t1 - recorte.ini;
    const libreFin = b.L - recorte.fin - t2;
    if (t1 < -0.01 || t2 > b.L + 0.01) {
      obs.push({ nivel: 'aviso', texto: `${nombre} se sale del borde ${NOMBRE_BORDE[o.borde]} (el borde mide ${Math.round(b.L)} mm).`, opId: o.id });
    } else if (libreIni < -0.01 || libreFin < -0.01) {
      obs.push({ nivel: 'aviso', texto: `${nombre} se mete en el corte de una esquina del borde ${NOMBRE_BORDE[o.borde]}.`, opId: o.id });
    } else if (esp > 0 && Math.min(libreIni, libreFin) < minBorde) {
      obs.push({
        nivel: 'aviso',
        texto: `${nombre} queda a ${Math.round(Math.min(libreIni, libreFin))} mm de la esquina. Lo recomendado es al menos ${minBorde} mm (2 veces el espesor).`,
        opId: o.id,
      });
    }
    if (esp > 0 && o.d < esp) {
      obs.push({ nivel: 'aviso', texto: `${nombre} es más pequeña que el espesor del vidrio (${plano.espesor} mm): pregunta al proveedor si la puede hacer.`, opId: o.id });
    }
    for (const q of boquetes) {
      if (q.borde !== o.borde || !(q.largo > 0)) continue;
      const [q1, q2] = tramoOcupado(q, b);
      if (t1 < q2 && q1 < t2) obs.push({ nivel: 'aviso', texto: `${nombre} se monta sobre el boquete ${num(q.id)}.`, opId: o.id });
    }
    for (let j = i + 1; j < medias.length; j++) {
      const otra = medias[j];
      if (otra.borde !== o.borde || !(otra.d > 0)) continue;
      const gap = Math.max(tramosMedia[j].t1 - t2, t1 - tramosMedia[j].t2);
      if (gap < 0) {
        obs.push({ nivel: 'aviso', texto: `Las medias perforaciones ${num(o.id)} y ${num(otra.id)} se montan una sobre otra.`, opId: o.id });
      } else if (esp > 0 && gap < minEntre) {
        obs.push({
          nivel: 'aviso',
          texto: `Las medias perforaciones ${num(o.id)} y ${num(otra.id)} quedan a ${Math.round(gap)} mm entre sí. Lo recomendado es al menos ${minEntre} mm.`,
          opId: o.id,
        });
      }
    }
  });

  return obs;
}
