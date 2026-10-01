// Pruebas de las reglas de código por proveedor (`utils/proveedorReglasCodigo.ts`).
//
// Origen, 2026-09-30: varios proveedores facturan el MISMO producto con códigos
// distintos y cada código nuevo volvía a "Por Mapear". Los casos de abajo son
// códigos y descripciones reales de sus facturas, con el producto al que el
// usuario los mapeó a mano: esa es la verdad contra la que se mide cada regla.
//
// Pura: no consulta Postgres (importar el módulo solo instancia Sequelize).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  indexar,
  probarRegla,
  modosPermitidos,
  resolverConRegla,
  REGLAS_CODIGO,
} from '../../utils/proveedorReglasCodigo';
import type { CodigoConocido, EquivalenciaConocida, ReglaCodigo } from '../../utils/proveedorReglasCodigo';

let pp = 1;
/** Un código mapeado. Productos por número para no depender del catálogo. */
function cod(codigo: string, descripcion: string, producto: number, unidad = 'TIRA_6M', ppId?: number): CodigoConocido {
  return { codigo, descripcion, catalogoProductoId: producto, unidadCompra: unidad, ppId: ppId ?? pp++ };
}
/** Las equivalencias que se derivan de una lista de códigos (una por producto+modalidad). */
function equivalenciasDe(codigos: CodigoConocido[], precios: Record<number, number> = {}): EquivalenciaConocida[] {
  const vistas = new Map<string, EquivalenciaConocida>();
  for (const c of codigos) {
    const k = `${c.catalogoProductoId}|${c.unidadCompra}`;
    if (!vistas.has(k)) {
      vistas.set(k, { ppId: c.ppId, catalogoProductoId: c.catalogoProductoId, unidadCompra: c.unidadCompra, precioActual: precios[c.ppId] ?? null });
    }
  }
  return [...vistas.values()];
}
const UMBRAL = 30;
const linea = (codigo: string, descripcion: string, precio: number | null = null, unidad: string | null = null) => ({
  codigo, descripcion, precio, unidad, unidadConfiable: !!unidad,
});

// ─── GRUPO ROLDAN: QUITAR_PREFIJO_LINEA ────────────────────────────────────

const ADA0606 = 606, CAB0601 = 601, SIL0601 = 701, ALF0601 = 1123, ALF0111 = 1111, JAM0108 = 393, CAB0104 = 392;
const roldan = [
  cod('GRE175NG', 'ADAPTADOR P/3831 GR175  NEGRO  (30UN)', ADA0606, 'TIRA_6M', 50),
  cod('GRE700NG', 'CABEZAL 7038 GR700 NEGRO  (4) (4.77K)', CAB0601, 'TIRA_6M', 51),
  cod('GRE701NG', 'SILLAR  S/7038 EMPOTRAR GR701 NEGRO  (2) (6.62K)', SIL0601, 'TIRA_6M', 52),
  cod('GRP701NG', 'SILLAR  S/7038 EMPOTRAR GR701 NEGRO  (2) (7.434K)', SIL0601, 'TIRA_6M', 52),
  cod('GRP1123NG', 'ALFAJIA 11 CM 1123 NEGRO (10) (2.54K)', ALF0601),
  cod('GRP1123NT', 'ALFAJIA 11 CM 1123 NATURAL (10) (2.54K)', ALF0111),
  cod('GRE393NT', 'JAMBA P/S 744 GR393 NATURAL (10)', JAM0108),
  cod('ALU392NT', 'CABEZAL  P/744  ALU392  NATURAL (16)', CAB0104),
];

test('Roldán: GRE701NG y GRP701NG son un acierto, y el color separa ALF0601 de ALF0111', () => {
  const prueba = probarRegla('QUITAR_PREFIJO_LINEA', roldan);
  assert.equal(prueba.errores.length, 0);
  assert.deepEqual(prueba.aciertos.map((a) => [a.codigo_a, a.codigo_b].sort()), [['GRE701NG', 'GRP701NG']]);
  assert.deepEqual(modosPermitidos(prueba), ['AUTO', 'SUGERENCIA']);
});

test('Roldán: ALU175NG se vincula a ADA0606 vía GRE175NG', () => {
  const indice = indexar('QUITAR_PREFIJO_LINEA', roldan, equivalenciasDe(roldan, { 50: 35640 }));
  const r = resolverConRegla(indice, linea('ALU175NG', 'ADAPTADOR P/3831 ALU175 NEGRO (20)', 34720), UMBRAL);
  assert.equal(r.tipo, 'VINCULAR');
  if (r.tipo !== 'VINCULAR') return;
  assert.equal(r.catalogoProductoId, ADA0606);
  assert.equal(r.unidadCompra, 'TIRA_6M');
  assert.equal(r.viaCodigo, 'GRE175NG');
  assert.ok(Math.abs((r.variacionPct ?? 0) - -2.58) < 0.1);
});

test('Roldán: el negro no se confunde con el natural (GRE390NG ≠ GRE390NT)', () => {
  const conocidos = [cod('GRE390NT', 'HORIZONTAL INFERIOR P/744 GR390 NATURAL (10)', 390)];
  const indice = indexar('QUITAR_PREFIJO_LINEA', conocidos, equivalenciasDe(conocidos));
  assert.equal(resolverConRegla(indice, linea('GRP390NG', 'HORIZONTAL INFERIOR P/744 GR390 NEGRO (12UN)'), UMBRAL).tipo, 'SIN_COINCIDENCIA');
});

test('Roldán: misma referencia y color pero otro tipo de pieza no se une (jamba 393 ≠ cabezal 393)', () => {
  const conocidos = [cod('GRE393NT', 'JAMBA P/S 744 GR393 NATURAL (10)', JAM0108)];
  const indice = indexar('QUITAR_PREFIJO_LINEA', conocidos, equivalenciasDe(conocidos));
  assert.equal(resolverConRegla(indice, linea('ALU393NT', 'CABEZAL P/744 ALU393 NATURAL'), UMBRAL).tipo, 'SIN_COINCIDENCIA');
});

test('Roldán: un precio que se aleja más del umbral no se vincula solo, se sugiere', () => {
  const indice = indexar('QUITAR_PREFIJO_LINEA', roldan, equivalenciasDe(roldan, { 51: 123188 }));
  const r = resolverConRegla(indice, linea('GRP700NG', 'CABEZAL 7038 GR700 NEGRO  (4)', 250000), UMBRAL);
  assert.equal(r.tipo, 'SUGERIR');
});

test('Roldán: la unidad confiable de la factura manda; sin equivalencia en esa modalidad solo sugiere', () => {
  const indice = indexar('QUITAR_PREFIJO_LINEA', roldan, equivalenciasDe(roldan));
  const r = resolverConRegla(indice, linea('ALU175NG', 'ADAPTADOR P/3831 ALU175 NEGRO', 6000, 'METRO'), UMBRAL);
  assert.equal(r.tipo, 'SUGERIR');
  if (r.tipo === 'SUGERIR') assert.equal(r.unidadCompra, 'METRO');
});

test('Roldán: dos productos con la misma llave no se adivinan', () => {
  const ambiguos = [
    cod('GRE175NG', 'ADAPTADOR P/3831 GR175 NEGRO', 1),
    cod('ALN175NG', 'ADAPTADOR P/3831 175 NEGRO', 2),
  ];
  const indice = indexar('QUITAR_PREFIJO_LINEA', ambiguos, equivalenciasDe(ambiguos));
  assert.equal(resolverConRegla(indice, linea('ALU175NG', 'ADAPTADOR P/3831 ALU175 NEGRO'), UMBRAL).tipo, 'SIN_COINCIDENCIA');
});

// ─── VENTANAS Y PUERTAS: SUFIJO_RETAL ─────────────────────────────────────

const CAB0306 = 306, SIL0304 = 304, JAM0302 = 302;
const vyp = [
  cod('392EC', 'CABEZAL 744 CRUDO (M2-P14-P13)', CAB0306, 'TIRA_6M', 37),
  cod('392ECMT', 'CABEZAL 744 CRUDO (M2) RETAL', CAB0306, 'METRO', 66),
  cod('387ECMT', 'SILLAR 744 CRUDO (M2) RETAL', SIL0304, 'METRO', 31),
  cod('174EC', 'JAMBA 3831 CRUDO (M1-P5-P4)', JAM0302, 'METRO', 23),
  cod('174ECMT', 'JAMBA 3831 CRUDO (M1) RETAL', JAM0302, 'METRO', 23),
  cod('A46M', 'ANG.1 x 3/4 X 1/16 MATE (D12-P9)', 101),
  cod('A46PN', 'ANG.1 x 3/4 x 1/16 PINTR NEGRA (D12-P9)', 601),
];

test('Ventanas y Puertas: los retales se unen al perfil entero y el color nunca', () => {
  const prueba = probarRegla('SUFIJO_RETAL', vyp);
  assert.equal(prueba.errores.length, 0);
  assert.equal(prueba.aciertos.length, 2); // 392EC~392ECMT y 174EC~174ECMT
});

test('Ventanas y Puertas: 387EC llegó facturado por METRO → va a la equivalencia por metro de SIL0304', () => {
  const equivalencias = [
    ...equivalenciasDe(vyp, { 31: 16554.62 }),
    { ppId: 209, catalogoProductoId: SIL0304, unidadCompra: 'TIRA_6M', precioActual: 101000 },
  ];
  const indice = indexar('SUFIJO_RETAL', vyp, equivalencias);
  const r = resolverConRegla(indice, linea('387EC', 'SILLAR 744 CRUDO M2 P14 P13', 16554.62, 'METRO'), UMBRAL);
  assert.equal(r.tipo, 'VINCULAR');
  if (r.tipo === 'VINCULAR') {
    assert.equal(r.ppId, 31);
    assert.equal(r.unidadCompra, 'METRO');
  }
});

test('Ventanas y Puertas: sin unidad en la factura y con tira y metro, no adivina la modalidad', () => {
  const equivalencias = [
    ...equivalenciasDe(vyp),
    { ppId: 209, catalogoProductoId: SIL0304, unidadCompra: 'TIRA_6M', precioActual: 101000 },
  ];
  const indice = indexar('SUFIJO_RETAL', vyp, equivalencias);
  assert.equal(resolverConRegla(indice, linea('387EC', 'SILLAR 744 CRUDO M2 P14 P13', 16554.62), UMBRAL).tipo, 'SUGERIR');
});

test('Ventanas y Puertas: un retal nuevo toma la modalidad METRO aunque la factura no la diga', () => {
  const conocidos = [cod('391EC', 'ENGANCHE 744 CRUDO (M2-P14-P13)', 304, 'TIRA_6M', 34)];
  const equivalencias = [...equivalenciasDe(conocidos), { ppId: 38, catalogoProductoId: 304, unidadCompra: 'METRO', precioActual: 18403 }];
  const indice = indexar('SUFIJO_RETAL', conocidos, equivalencias);
  const r = resolverConRegla(indice, linea('391ECMT', 'ENGANCHE 744 CRUDO (M2) RETAL', 18403), UMBRAL);
  assert.equal(r.tipo, 'VINCULAR');
  if (r.tipo === 'VINCULAR') assert.equal(r.ppId, 38);
});

// ─── VEA: IGNORAR_MANO ─────────────────────────────────────────────────────

const vea = [
  cod('0040002000023', 'CHAPETA DIV. BAO 6mm. IZQUIERDA 517', 9001, 'UNIDAD', 80),
  cod('0040001000080', 'CHAPETA CENTRAL CERRAD. PICO LORO DER. B/M', 9002, 'UNIDAD', 81),
  cod('0040005000060', 'CHAPETA 70X50 CERRAD. VIT. ESQ. IZQ. NEGRO', 9003, 'UNIDAD', 82),
];

test('VEA: sin pares mapeados la regla no tiene evidencia y solo puede sugerir', () => {
  const prueba = probarRegla('IGNORAR_MANO', vea);
  assert.equal(prueba.aciertos.length, 0);
  assert.equal(prueba.errores.length, 0);
  assert.deepEqual(modosPermitidos(prueba), ['SUGERENCIA']);
});

test('VEA: la derecha encuentra a la izquierda (incluso "PICO LORO" contra "PICOLORO")', () => {
  const indice = indexar('IGNORAR_MANO', vea, equivalenciasDe(vea));
  const a = resolverConRegla(indice, linea('0040002000006', 'CHAPETA DIV. BAO 6mm. DERECHA 517', 11970), UMBRAL);
  const b = resolverConRegla(indice, linea('0040001000090', 'CHAPETA CENTRAL CERRAD. PICOLORO IZQ. B/M', 110250), UMBRAL);
  const c = resolverConRegla(indice, linea('0040005000049', 'CHAPETA 70X50 CERRAD. VIT. ESQ. DER. NEGRO', 22230), UMBRAL);
  assert.equal(a.tipo === 'VINCULAR' && a.catalogoProductoId, 9001);
  assert.equal(b.tipo === 'VINCULAR' && b.catalogoProductoId, 9002);
  assert.equal(c.tipo === 'VINCULAR' && c.catalogoProductoId, 9003);
});

test('VEA: una descripción sin mano no se compara (la regla solo se ocupa de la mano)', () => {
  const indice = indexar('IGNORAR_MANO', vea, equivalenciasDe(vea));
  assert.equal(resolverConRegla(indice, linea('0040002000999', 'CHAPETA DIV. BAO 6mm. 517'), UMBRAL).tipo, 'SIN_COINCIDENCIA');
});

// ─── HI-TECH: FAMILIA_POR_PREFIJO ─────────────────────────────────────────

test('HI-TECH: la familia agrupa lo que el catálogo agrupa', () => {
  const hitech = [
    cod('SV1590-15', 'SOLAR VISION 15% IR90 PS', 103, 'METRO'),
    cod('SV3590-15', 'SOLAR VISION 35% IR90 PS', 103, 'METRO'),
    cod('TI1532-08', 'TITANIO 15% DE 80 CMS.', 107, 'METRO'),
    cod('TI1560-08', 'TITANIO 15%', 107, 'METRO'),
    cod('BP2060-12', 'BLACK PREMIUM 20%', 104, 'METRO'),
  ];
  const prueba = probarRegla('FAMILIA_POR_PREFIJO', hitech);
  assert.equal(prueba.errores.length, 0);
  assert.equal(prueba.aciertos.length, 2);
});

// ─── ACVICOL: ninguna regla sirve, y la prueba lo demuestra ───────────────

test('ACVICOL: ninguna regla puede activarse en automático (el -8 es negro y sí es otro producto)', () => {
  const acvicol = [
    cod('IBHT-CO', 'Inox Boton haladera tambor CO', 1101, 'UNIDAD'),
    cod('IBHTCO-8', 'Inox Boton haladera tambor CO negro micro texturizado', 601, 'UNIDAD'),
    cod('IABEU-8', 'Inox Accesorio barra estabilizadora U negro', 2, 'UNIDAD'),
    cod('IABEO-8', 'Inox Accesorio barra estabilizadora O negro', 3, 'UNIDAD'),
    cod('IKDPRIM', 'Inox Kit deslizante Primavera', 306, 'UNIDAD'),
    cod('IKDPRIM-8', 'Inox Kit deslizante primavera negro micro texturizado', 1106, 'UNIDAD'),
  ];
  for (const regla of Object.keys(REGLAS_CODIGO) as ReglaCodigo[]) {
    const prueba = probarRegla(regla, acvicol);
    assert.ok(!modosPermitidos(prueba).includes('AUTO'), `${regla} no debería admitir modo automático en ACVICOL`);
    if (prueba.errores.length > 0) assert.deepEqual(modosPermitidos(prueba), [], `${regla} con errores no se activa`);
  }
});

test('Una regla con un solo error no admite ningún modo', () => {
  const prueba = probarRegla('QUITAR_PREFIJO_LINEA', [
    cod('GRE175NG', 'ADAPTADOR P/3831 GR175 NEGRO', 1),
    cod('ALU175NG', 'ADAPTADOR P/3831 ALU175 NEGRO', 2),
  ]);
  assert.equal(prueba.errores.length, 1);
  assert.deepEqual(modosPermitidos(prueba), []);
});
