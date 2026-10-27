// Piezas de construcción compartidas por el catálogo de plantillas y por los kits de herraje.

import type { BordeId, Contorno, EsquinaId, Operacion, Pieza, RefX, RefY, TratamientoEsquina } from './tipos';

let seq = 0;
export const nuevoId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export const PF = (d: number, x: number, refX: RefX, y: number, refY: RefY): Operacion => ({ id: nuevoId(), tipo: 'perforacion', d, x, refX, y, refY });
export const BQ = (borde: BordeId, pos: number, desde: 'inicio' | 'fin', largo: number, prof: number, radio = 0): Operacion => ({
  id: nuevoId(),
  tipo: 'boquete',
  borde,
  pos,
  desde,
  largo,
  prof,
  radio,
});
/** Boquete con un alivio de Ø `d` a cada lado, hasta `fondo` del canto. */
export const BQA = (borde: BordeId, pos: number, desde: 'inicio' | 'fin', largo: number, prof: number, d: number, fondo: number): Operacion => ({
  id: nuevoId(),
  tipo: 'boquete',
  borde,
  pos,
  desde,
  largo,
  prof,
  radio: 0,
  alivio: { d, fondo },
});
export const CH = (borde: BordeId, ancho: number): Operacion => ({ id: nuevoId(), tipo: 'chaflan', borde, ancho });
export const NOTA = (texto: string, x: number, y: number): Operacion => ({ id: nuevoId(), tipo: 'nota', texto, x, y });

export const recta = (): TratamientoEsquina => ({ tipo: 'recta' });
export const dsp = (a: number, b = a): TratamientoEsquina => ({ tipo: 'despunte', a, b });
export const rad = (r: number): TratamientoEsquina => ({ tipo: 'radio', r });
export const mue = (a: number, b: number): TratamientoEsquina => ({ tipo: 'muesca', a, b });
export const esq = (p: Partial<Record<EsquinaId, TratamientoEsquina>> = {}): Record<EsquinaId, TratamientoEsquina> => ({
  si: recta(),
  sd: recta(),
  id: recta(),
  ii: recta(),
  ...p,
});
export const RECT: Contorno = { tipo: 'rectangular' };
export const desplome = (lado: 'izq' | 'der', anchoSup: number): Contorno => ({ tipo: 'desplome-lateral', lado, anchoSup });
export const arco = (lado: BordeId): Contorno => ({ tipo: 'arco', lado });
export const CIRCULO: Contorno = { tipo: 'circulo' };

export const pieza = (ancho: number, alto: number, operaciones: Operacion[] = [], esquinas = esq(), contorno: Contorno = RECT): Pieza => ({
  ancho,
  alto,
  contorno,
  esquinas,
  operaciones,
});

/** Marca varias operaciones como un mismo herraje: se arrastran y se eliminan juntas. */
export function agrupar(nombre: string, ops: Operacion[]): Operacion[] {
  if (ops.length < 2) return ops;
  const grupo = { id: nuevoId(), nombre };
  return ops.map((o) => ({ ...o, grupo }));
}

// ── Herrajes típicos (cotas tomadas de «1.1 DETALLES TECNICOS.xlsx») ─────────
export const perfCorredera = () => agrupar('Rodamientos de corrediza', [PF(6, 60, 'izq', 15, 'sup'), PF(6, 60, 'der', 15, 'sup')]);
export const perfGlassvit = (x: number) => agrupar('Herraje Glassvit', [PF(14, x, 'izq', 25, 'sup'), PF(14, x, 'der', 25, 'sup')]);
/** Par de bisagras: 4 perforaciones Ø16 a `x1` del borde izquierdo y `sep` entre centros, a 200 de arriba y de abajo. */
export const bisagras = (x1: number, sep: number) =>
  agrupar(`Bisagras ${x1}-${sep}`, [
    PF(16, x1, 'izq', 200, 'sup'),
    PF(16, x1 + sep, 'izq', 200, 'sup'),
    PF(16, x1, 'izq', 200, 'inf'),
    PF(16, x1 + sep, 'izq', 200, 'inf'),
  ]);
export const boton = (x: number, y: number) => [PF(8, x, 'der', y, 'inf')];
export const toalleroHor = (x: number, y: number, sep = 200) => agrupar('Toallero horizontal', [PF(8, x, 'der', y, 'inf'), PF(8, x + sep, 'der', y, 'inf')]);
export const toalleroVer = (x: number, y: number, sep = 200) => agrupar('Toallero vertical', [PF(8, x, 'der', y, 'inf'), PF(8, x, 'der', y + sep, 'inf')]);
/** Muescas en el borde derecho a 200 mm de arriba y de abajo (fijo contra batiente). */
export const muescasFijo = (largo: number, prof: number) => agrupar('Muescas para batiente', [BQ('der', 200, 'inicio', largo, prof), BQ('der', 200, 'fin', largo, prof)]);
export const muescaPiso = (largo: number, prof: number) => [BQ('inf', 100, 'inicio', largo, prof)];
export const cuatroEsquinas = (d: number, x: number, y: number) =>
  agrupar('Perforaciones en esquinas', [PF(d, x, 'izq', y, 'sup'), PF(d, x, 'der', y, 'sup'), PF(d, x, 'izq', y, 'inf'), PF(d, x, 'der', y, 'inf')]);
export const cierrePuerta = () => [BQ('der', 1000, 'fin', 75, 30, 15)];
/** Kit Optiglass: 2 perf. Ø23 a 85 de cada canto y 21 de arriba, cada una abierta al borde con una ranura de 12. */
export const kitOptiglass = () =>
  agrupar('Kit Optiglass', [PF(23, 85, 'izq', 21, 'sup'), PF(23, 85, 'der', 21, 'sup'), BQ('sup', 79, 'inicio', 12, 21), BQ('sup', 79, 'fin', 12, 21)]);
/** Manija tipo Roma: 2 perf. Ø`d` a `x` del canto derecho, a `y` del piso y `sep` más arriba. */
export const manijaRoma = (x = 85, y = 800, sep = 400, d = 14) => agrupar('Manija Roma', [PF(d, x, 'der', y, 'inf'), PF(d, x, 'der', y + sep, 'inf')]);
