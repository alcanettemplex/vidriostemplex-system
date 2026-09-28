// Kits de herraje: un clic agrega todas las perforaciones / boquetes de un herraje, ya ubicados.
// Después se pueden arrastrar en el plano (se mueven juntos) o ajustar número por número.

import { BQ, PF, agrupar, bisagras, cuatroEsquinas, dsp, muescasFijo, perfCorredera, perfGlassvit, toalleroHor, toalleroVer } from './constructores';
import type { Pieza } from './tipos';

export interface Herraje {
  id: string;
  nombre: string;
  descripcion: string;
  aplicar: (p: Pieza) => Pieza;
}

const agregar = (p: Pieza, ops: Pieza['operaciones']): Pieza => ({ ...p, operaciones: [...p.operaciones, ...ops] });
/** Altura desde el piso para manijas y toalleros: 1000 mm, o media altura si el vidrio es bajo. */
const alturaManija = (p: Pieza, deseada = 1000) => Math.min(deseada, Math.round(p.alto / 2));

export const HERRAJES: Herraje[] = [
  {
    id: 'bisagras-2840',
    nombre: 'Bisagras 28-40',
    descripcion: '4 perforaciones Ø16 en el borde izquierdo, a 200 mm de arriba y de abajo.',
    aplicar: (p) => agregar(p, bisagras(28, 40)),
  },
  {
    id: 'bisagras-2530',
    nombre: 'Bisagras 25-30',
    descripcion: '4 perforaciones Ø16 en el borde izquierdo, a 200 mm de arriba y de abajo.',
    aplicar: (p) => agregar(p, bisagras(25, 30)),
  },
  {
    id: 'bisagras-1pto',
    nombre: 'Bisagras de 1 punto',
    descripcion: '2 perforaciones Ø16 a 25 mm del borde izquierdo.',
    aplicar: (p) => agregar(p, agrupar('Bisagras de 1 punto', [PF(16, 25, 'izq', 200, 'sup'), PF(16, 25, 'izq', 200, 'inf')])),
  },
  {
    id: 'boton',
    nombre: 'Botón o manija',
    descripcion: '1 perforación Ø8 a 50 mm del borde derecho y 1000 mm del piso.',
    aplicar: (p) => agregar(p, [PF(8, 50, 'der', alturaManija(p), 'inf')]),
  },
  {
    id: 'toallero-hor',
    nombre: 'Toallero horizontal',
    descripcion: '2 perforaciones Ø8 separadas 200 mm, a 1000 mm del piso.',
    aplicar: (p) => agregar(p, toalleroHor(50, alturaManija(p))),
  },
  {
    id: 'toallero-ver',
    nombre: 'Toallero vertical',
    descripcion: '2 perforaciones Ø8 separadas 200 mm, a 50 mm del borde derecho.',
    aplicar: (p) => agregar(p, toalleroVer(50, alturaManija(p, 900))),
  },
  {
    id: 'rodamientos',
    nombre: 'Rodamientos de corrediza',
    descripcion: '2 perforaciones Ø6 arriba y despuntes de 30×30 en las esquinas superiores.',
    aplicar: (p) => ({ ...agregar(p, perfCorredera()), esquinas: { ...p.esquinas, si: dsp(30), sd: dsp(30) } }),
  },
  {
    id: 'glassvit',
    nombre: 'Herraje Glassvit',
    descripcion: '2 perforaciones Ø14 a 60 mm de los lados y 25 mm de arriba.',
    aplicar: (p) => agregar(p, perfGlassvit(60)),
  },
  {
    id: 'tablero',
    nombre: 'Perforaciones de tablero',
    descripcion: '4 perforaciones Ø14 a 50 mm de cada esquina.',
    aplicar: (p) => agregar(p, cuatroEsquinas(14, 50, 50)),
  },
  {
    id: 'muescas-batiente',
    nombre: 'Muescas para batiente',
    descripcion: '2 boquetes de 30×35 en el borde derecho, a 200 mm de arriba y de abajo.',
    aplicar: (p) => agregar(p, muescasFijo(30, 35)),
  },
  {
    id: 'cerradura',
    nombre: 'Cerradura o recibidor',
    descripcion: 'Boquete redondeado de 75×30 en el borde derecho, a 1000 mm del piso.',
    aplicar: (p) => agregar(p, [BQ('der', alturaManija(p), 'fin', 75, 30, 15)]),
  },
  {
    id: 'pasa-voz',
    nombre: 'Pasa voz',
    descripcion: '5 perforaciones Ø12 en cruz, separadas 50 mm, en el centro del vidrio.',
    aplicar: (p) =>
      agregar(
        p,
        agrupar('Pasa voz', [PF(12, 0, 'centro', 0, 'centro'), PF(12, -50, 'centro', 0, 'centro'), PF(12, 50, 'centro', 0, 'centro'), PF(12, 0, 'centro', -50, 'centro'), PF(12, 0, 'centro', 50, 'centro')]),
      ),
  },
];
