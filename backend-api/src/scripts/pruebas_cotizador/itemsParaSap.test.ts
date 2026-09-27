// Pruebas de `cotizador/lib/itemsParaSap.ts` — filas de la SAP desde la
// propuesta elegida de una cotización (botón "Traer ítems de la cotización" de
// la ficha ODP, 2026-09-27).
//
// Como `generadorSapPerfileria.test.ts`, ESTA SUITE NO abre conexión a Postgres
// ni precarga la caché: la función es pura y recibe las equivalencias de
// catálogo ya resueltas. Se puede correr con el backend dev arriba.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  itemsParaSap,
  letraDeIndice,
  indiceDeLetra,
  OBS_SIN_CORTES,
  OBS_NO_APTO,
  OBS_SIN_MEDIDA_PANO,
} from '../../cotizador/lib/itemsParaSap';
import type { ItemCotizacionParaSap, LineaBomLaxa, EquivalenciaCatalogo } from '../../cotizador/lib/itemsParaSap';
import type { CortePerfil, CorteVidrio } from '../../cotizador/tipos';

function corte(d: Partial<CortePerfil> & { medidaMm: number; cantidad: number }): CortePerfil {
  return { ref: 'REF', descripcion: 'Cabezal', codigo: 'PRV700MATE', desperdicioPct: 5, ...d };
}
function linea(d: LineaBomLaxa): LineaBomLaxa {
  return { unidad: 'UND', cantidad: 1, error: false, ...d };
}
function itemDiseno(
  perfiles: CortePerfil[],
  bom: LineaBomLaxa[],
  extra: Partial<ItemCotizacionParaSap> = {},
  vidrios: CorteVidrio[] = []
): ItemCotizacionParaSap {
  return {
    moduloId: 'ventanas',
    cantidadPiezas: 1,
    aptoParaCorte: true,
    input: { anchoCm: 100, altoCm: 100 },
    ...extra,
    resultado: { items: bom, cortes: { perfiles, vidrios } },
  };
}

const EQUIV = new Map<string, EquivalenciaCatalogo>([
  ['PRV700MATE', { codigo: 'CAB0103', descripcion: '7038 CABEZAL 700 MATE' }],
  ['JAM0103', { codigo: 'JAM0103', descripcion: '7038 JAMBA MATE' }],
  ['ROD01', { codigo: 'ROD01', descripcion: 'RODAMIENTO SENCILLO' }],
]);

test('perfil con cortes: código y descripción del ERP, cortes × piezas separados por " / ", barras de 6 m', () => {
  const it = itemDiseno(
    [corte({ medidaMm: 1200, cantidad: 1 }), corte({ medidaMm: 1500, cantidad: 2 })],
    [linea({ codigo: 'PRV700MATE', categoria: 'PERFILERIA', unidad: 'X METRO', cantidad: 4.41, descripcion: 'CABEZAL COTIZADOR' })],
    { cantidadPiezas: 2 }
  );
  const { filas } = itemsParaSap([it], { equivalencias: EQUIV });
  assert.equal(filas.length, 1);
  const f = filas[0];
  assert.equal(f.item, 'A');
  assert.equal(f.codigo, 'CAB0103');
  assert.equal(f.descripcion, '7038 CABEZAL 700 MATE');
  assert.equal(f.dimension, '2-1200 / 4-1500');
  // (2×1,2 + 4×1,5) = 8,4 m × 1,05 = 8,82 m → 2 barras.
  assert.equal(f.cantidad, 2);
  assert.equal(f.tipo, 'perfil');
  assert.equal(f.observacion, '');
});

test('el mismo perfil en dos ítems se agrupa en una fila, en orden de aparición', () => {
  const a = itemDiseno([corte({ medidaMm: 1000, cantidad: 2 }), corte({ codigo: 'JAM0103', medidaMm: 900, cantidad: 2 })], []);
  const b = itemDiseno([corte({ medidaMm: 1000, cantidad: 1 }), corte({ medidaMm: 800, cantidad: 1 })], []);
  const { filas } = itemsParaSap([a, b], { equivalencias: EQUIV });
  assert.deepEqual(filas.map((f) => [f.item, f.codigo, f.dimension]), [
    ['A', 'CAB0103', '3-1000 / 1-800'],
    ['B', 'JAM0103', '2-900'],
  ]);
});

test('dos códigos del Cotizador con el mismo código del ERP caen en la misma fila', () => {
  const equiv = new Map(EQUIV);
  equiv.set('PRV700MATE_B', { codigo: 'CAB0103', descripcion: '7038 CABEZAL 700 MATE' });
  const it = itemDiseno([corte({ medidaMm: 1000, cantidad: 1 }), corte({ codigo: 'PRV700MATE_B', medidaMm: 500, cantidad: 1 })], []);
  const { filas } = itemsParaSap([it], { equivalencias: equiv });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].dimension, '1-1000 / 1-500');
});

test('accesorios: cantidad × piezas, unidad corta, sin dimensión; los que van por metro se redondean hacia arriba', () => {
  const it = itemDiseno([], [
    linea({ codigo: 'ROD01', categoria: 'ACCESORIO', unidad: 'UND', cantidad: 4, descripcion: 'rodamiento' }),
    linea({ codigo: 'EMP01', categoria: 'ACCESORIO', unidad: 'X METRO', cantidad: 3.333, descripcion: 'EMPAQUE' }),
    linea({ codigo: 'ROD01', categoria: 'ACCESORIO', unidad: 'UND', cantidad: 2, descripcion: 'rodamiento' }),
  ], { cantidadPiezas: 3 });
  const { filas } = itemsParaSap([it], { equivalencias: EQUIV });
  const rod = filas.find((f) => f.codigo === 'ROD01')!;
  const emp = filas.find((f) => f.codigo === 'EMP01')!;
  assert.equal(rod.cantidad, 18);
  assert.equal(rod.und, 'UND');
  assert.equal(rod.descripcion, 'RODAMIENTO SENCILLO');
  assert.equal(rod.dimension, '');
  assert.equal(emp.cantidad, 10); // 3,333 × 3 = 9,999 → 10,00
  assert.equal(emp.und, 'ML');
  assert.equal(emp.descripcion, 'EMPAQUE'); // sin equivalencia: la del BOM
});

test('película y matizado: una fila por tamaño de paño del despiece, cantidad = paños × piezas', () => {
  const it = itemDiseno(
    [],
    [
      linea({ codigo: 'PELI31', categoria: 'ACABADO', unidad: 'X METRO', cantidad: 2.4, descripcion: 'PELICULA NORMAL' }),
      linea({ codigo: 'MATI07', categoria: 'ACABADO', unidad: 'X METRO', cantidad: 2.4, descripcion: 'MATIZADO TOTAL' }),
    ],
    { cantidadPiezas: 2 },
    [
      { descripcion: 'claro', anchoMm: 750.4, altoMm: 1600, cantidad: 2 },
      { descripcion: 'claro', anchoMm: 500, altoMm: 1600, cantidad: 1 },
    ]
  );
  const { filas } = itemsParaSap([it]);
  assert.deepEqual(filas.map((f) => [f.codigo, f.dimension, f.cantidad]), [
    ['PELI31', '750 x 1600', 4],
    ['PELI31', '500 x 1600', 2],
    ['MATI07', '750 x 1600', 4],
    ['MATI07', '500 x 1600', 2],
  ]);
});

test('película sin diseño: el paño es la medida del formulario (cm → mm); proyectante por nave', () => {
  const tablero: ItemCotizacionParaSap = {
    moduloId: 'tablero', cantidadPiezas: 1, input: { anchoCm: 120, altoCm: 60 },
    resultado: { items: [linea({ codigo: 'PELI31', categoria: 'ACABADO', cantidad: 0.72, descripcion: 'PELICULA NORMAL' })] },
  };
  const proyectante: ItemCotizacionParaSap = {
    moduloId: 'proyectantes', cantidadPiezas: 2, input: { anchoNaveCm: 60, altoNaveCm: 80, numeroNaves: 3 },
    resultado: { items: [linea({ codigo: 'MATI07', categoria: 'ACABADO', cantidad: 1.44, descripcion: 'MATIZADO TOTAL' })] },
  };
  const { filas } = itemsParaSap([tablero, proyectante]);
  assert.deepEqual(filas.map((f) => [f.codigo, f.dimension, f.cantidad]), [
    ['PELI31', '1200 x 600', 1],
    ['MATI07', '600 x 800', 6],
  ]);
});

test('película sin medida de paño: trae la cantidad del BOM y pide medir en obra', () => {
  const it: ItemCotizacionParaSap = {
    moduloId: 'item-libre', cantidadPiezas: 1, input: {},
    resultado: { items: [linea({ codigo: 'PEL0107', categoria: 'VIDRIO', unidad: 'X METRO', cantidad: 2.5, descripcion: 'PELICULA CONTROL SOLAR' })] },
  };
  const { filas, advertencias } = itemsParaSap([it]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo, 'acabado'); // PEL0107 está en VIDRIO pero es película
  assert.equal(filas[0].cantidad, 2.5);
  assert.equal(filas[0].observacion, OBS_SIN_MEDIDA_PANO);
  assert.ok(advertencias.some((a) => a.includes('medida del paño')));
});

test('no trae vidrio ni sus procesos (van al Pedido PV); la guía de piso GPI sí, como accesorio', () => {
  const it = itemDiseno([], [
    linea({ codigo: 'CL6MM03SP', categoria: 'VIDRIO', unidad: 'X M2', cantidad: 1.2, descripcion: 'VIDRIO CLARO 6MM' }),
    linea({ codigo: 'BPB04', categoria: 'ACABADO', unidad: 'X METRO', cantidad: 4, descripcion: 'BPB 4-6' }),
    linea({ codigo: 'PERF01', categoria: 'ACABADO', unidad: 'UND', cantidad: 2, descripcion: 'PERFORACION' }),
    linea({ codigo: 'GPI1102', categoria: 'VIDRIO', unidad: 'ml', cantidad: 1.5, descripcion: 'GUIA DE PISO NYLON' }),
  ]);
  const { filas, excluidos } = itemsParaSap([it]);
  assert.deepEqual(filas.map((f) => f.codigo), ['GPI1102']);
  assert.equal(filas[0].tipo, 'accesorio');
  assert.deepEqual(excluidos.map((e) => e.codigo).sort(), ['BPB04', 'CL6MM03SP', 'PERF01']);
});

test('ítem sin diseño: barras desde los metros del BOM, "Total N m" y medir en obra', () => {
  const it: ItemCotizacionParaSap = {
    moduloId: 'ventanas', cantidadPiezas: 2, input: { anchoCm: 100, altoCm: 100 },
    resultado: {
      items: [
        linea({ codigo: 'JAM0103', categoria: 'PERFILERIA', unidad: 'X METRO', cantidad: 2.1, descripcion: 'jamba' }),
        linea({ codigo: 'TUB0316', categoria: 'PERFILERIA', unidad: 'UND', cantidad: 1, descripcion: 'TUBO INOX' }),
      ],
    },
  };
  const { filas } = itemsParaSap([it], { equivalencias: EQUIV });
  const jamba = filas.find((f) => f.codigo === 'JAM0103')!;
  assert.equal(jamba.tipo, 'perfil_sin_cortes');
  assert.equal(jamba.dimension, 'Total 4,2 m');
  assert.equal(jamba.cantidad, 1);
  assert.equal(jamba.observacion, OBS_SIN_CORTES);
  const tubo = filas.find((f) => f.codigo === 'TUB0316')!;
  assert.equal(tubo.cantidad, 2); // por unidad: piezas, no barras
  assert.equal(tubo.dimension, '');
});

test('diseño con un perfil de blob viejo (sin % de desperdicio): ese perfil cae a "sin cortes", no se pierde', () => {
  const viejo = corte({ codigo: 'JAM0103', medidaMm: 1000, cantidad: 2 });
  delete viejo.desperdicioPct;
  const it = itemDiseno(
    [corte({ medidaMm: 1000, cantidad: 1 }), viejo],
    [
      linea({ codigo: 'PRV700MATE', categoria: 'PERFILERIA', unidad: 'X METRO', cantidad: 1.05 }),
      linea({ codigo: 'JAM0103', categoria: 'PERFILERIA', unidad: 'X METRO', cantidad: 2.1 }),
    ]
  );
  const { filas } = itemsParaSap([it], { equivalencias: EQUIV });
  assert.deepEqual(filas.map((f) => [f.codigo, f.tipo, f.dimension]), [
    ['CAB0103', 'perfil', '1-1000'],
    ['JAM0103', 'perfil_sin_cortes', 'Total 2,1 m'],
  ]);
});

test('diseño no apto para corte: se trae, pero con la observación de verificar', () => {
  const it = itemDiseno([corte({ medidaMm: 1000, cantidad: 1 })], [], { aptoParaCorte: false });
  const { filas } = itemsParaSap([it], { equivalencias: EQUIV });
  assert.equal(filas[0].observacion, OBS_NO_APTO);
});

test('líneas con error no se traen y se avisan', () => {
  const it = itemDiseno([], [
    linea({ codigo: 'X1', categoria: 'ERROR', descripcion: 'perfil sin precio', error: true }),
    linea({ codigo: 'ROD01', categoria: 'ACCESORIO', cantidad: 1 }),
  ]);
  const { filas, advertencias } = itemsParaSap([it], { equivalencias: EQUIV });
  assert.deepEqual(filas.map((f) => f.codigo), ['ROD01']);
  assert.ok(advertencias.some((a) => a.includes('perfil sin precio')));
});

test('orden de filas (perfiles, sin cortes, accesorios, acabados), letras desde el índice pedido y origen marcado', () => {
  const con = itemDiseno([corte({ medidaMm: 1000, cantidad: 1 })], [
    linea({ codigo: 'ROD01', categoria: 'ACCESORIO', cantidad: 2 }),
    linea({ codigo: 'PELI31', categoria: 'ACABADO', cantidad: 1 }),
  ]);
  const sin: ItemCotizacionParaSap = {
    cantidadPiezas: 1, input: {}, resultado: { items: [linea({ codigo: 'JAM0103', categoria: 'PERFILERIA', unidad: 'X METRO', cantidad: 3 })] },
  };
  const { filas } = itemsParaSap([con, sin], { equivalencias: EQUIV, indiceInicial: 9, origenCotizacionId: 77 });
  assert.deepEqual(filas.map((f) => [f.item, f.tipo]), [
    ['J', 'perfil'], ['K', 'perfil_sin_cortes'], ['L', 'accesorio'], ['M', 'acabado'],
  ]);
  assert.ok(filas.every((f) => f.origen_cotizacion_id === 77));
});

test('letras: A…Z y luego "27", "28" (convención de SAPModal); indiceDeLetra es su inversa', () => {
  assert.equal(letraDeIndice(0), 'A');
  assert.equal(letraDeIndice(25), 'Z');
  assert.equal(letraDeIndice(26), '27');
  assert.equal(indiceDeLetra('A'), 0);
  assert.equal(indiceDeLetra('j'), 9);
  assert.equal(indiceDeLetra('27'), 26);
  assert.equal(indiceDeLetra('AA'), 26);
  assert.equal(indiceDeLetra(''), -1);
});

test('una dimensión que no cabe en 100 caracteres pasa completa a la observación', () => {
  const cortes = Array.from({ length: 20 }, (_, i) => corte({ medidaMm: 1000 + i * 10, cantidad: 1 }));
  const { filas } = itemsParaSap([itemDiseno(cortes, [])], { equivalencias: EQUIV });
  assert.equal(filas[0].dimension, 'Ver cortes en observación');
  assert.ok(filas[0].observacion.startsWith('Cortes: 1-1000 / 1-1010'));
  assert.ok(filas[0].observacion.includes('1-1190'));
});

test('avisa los códigos sin equivalencia en el catálogo del ERP', () => {
  const it = itemDiseno([], [linea({ codigo: 'ZZZ01', categoria: 'ACCESORIO', cantidad: 1, descripcion: 'raro' })]);
  const { filas, advertencias } = itemsParaSap([it], { equivalencias: EQUIV });
  assert.equal(filas[0].codigo, 'ZZZ01');
  assert.ok(advertencias.some((a) => a.includes('ZZZ01')));
});
