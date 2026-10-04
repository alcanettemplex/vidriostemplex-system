// Aptitud para la orden de corte (`lib/aptitudOrden.ts`), 2026-10-03.
//
// Es lo que decide si una pieza va al taller a cortarse: un falso "apto" corta
// aluminio con una medida mala; un falso "no apto" sin motivo deja al asesor
// sin saber qué arreglar. Hasta hoy solo se tocaba de refilón desde
// `personalizacion.test.ts`.
//
// Cada condición tiene su caso que PASA y su caso que BLOQUEA, y se comprueba
// por `codigo` (contrato estable de `CODIGOS_MOTIVO`), nunca por la redacción.
// Los blobs se arman con el motor real (`calcularItem`) y después se alteran a
// mano para simular cotizaciones viejas o catálogos que cambiaron.
//
// Precarga la caché (Postgres) — no escribe nada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sequelize } from '../../models';
import * as cache from '../../cotizador/cache';
import { calcularItem } from '../../cotizador/modules/registry';
import { evaluarAptitudOrden, CODIGOS_MOTIVO } from '../../cotizador/lib/aptitudOrden';
import { listarDisenos, NIVELES_APTOS_PARA_CORTE, esNivelAptoParaCorte } from '../../cotizador/lib/motorDespiece';

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

/* eslint-disable @typescript-eslint/no-explicit-any */
type Blob = Record<string, any>;

const BASE = { colorPerfileria: 'mate', codigoVidrio: 'CL4MM01CR', segmentoCliente: 'PA', cantidadPiezas: 1 };

/** Un ítem de ventana por diseño, calculado por el motor real. */
function itemDe(disenoId: string, id = 1, medidas = { anchoCm: 150, altoCm: 120 }) {
  const input = { ...BASE, ...medidas, disenoId };
  return { id, moduloId: 'ventanas', input, resultado: calcularItem('ventanas', input) as Blob };
}

/** Copia profunda, para alterar un blob sin tocar el original. */
const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const codigosDe = (r: ReturnType<typeof evaluarAptitudOrden>, i = 0) =>
  (r.porItem[i]?.motivos ?? []).map((m) => m.codigo).sort();

const aprobada = (...items: any[]) => ({ estado: 'APROBADA', items }) as any;

/** Primer diseño de ventana cotizable con ese nivel. */
function disenoConNivel(nivel: string): string {
  const d = listarDisenos({ soloCotizables: true }).find(
    (x) => x.id.startsWith('Sistema') && x.nivelCorte === nivel
  );
  assert.ok(d, `no hay ningún diseño de ventana nivel ${nivel} en el catálogo`);
  return d.id;
}

// ─── La regla de niveles (una sola fuente) ──────────────────────────────────

test('regla única: A y B son aptos; C, vacío y desconocido no', () => {
  assert.deepEqual([...NIVELES_APTOS_PARA_CORTE].sort(), ['A', 'B']);
  assert.equal(esNivelAptoParaCorte('A'), true);
  assert.equal(esNivelAptoParaCorte('B'), true);
  assert.equal(esNivelAptoParaCorte('C'), false);
  assert.equal(esNivelAptoParaCorte(null), false);
  assert.equal(esNivelAptoParaCorte(undefined), false);
  assert.equal(esNivelAptoParaCorte(''), false);
});

test('CODIGOS_MOTIVO es contrato estable: cada clave vale su propio nombre', () => {
  for (const [clave, valor] of Object.entries(CODIGOS_MOTIVO)) assert.equal(valor, clave);
  assert.deepEqual(Object.keys(CODIGOS_MOTIVO).sort(), [
    'COTIZACION_NO_APROBADA', 'DESPIECE_NO_VERIFICABLE', 'HAY_ERRORES_EN_ITEM', 'HOLGURA_AUSENTE',
    'MEDIDA_PERFIL_DESACTUALIZADA', 'MEDIDA_VIDRIO_DESACTUALIZADA', 'NIVEL_NO_VALIDADO', 'NO_APTO_PARA_CORTE',
    'PERFILERIA_PERSONALIZADA', 'SIN_DESPIECE_POR_DISENO', 'SIN_PROPUESTA_ELEGIDA', 'SISTEMA_NO_EN_PRODUCCION',
  ]);
});

// ─── Caso feliz ─────────────────────────────────────────────────────────────

test('ventana nivel B aprobada y sin errores → imprimible, sin motivos', () => {
  const r = evaluarAptitudOrden(aprobada(itemDe(disenoConNivel('B'))));
  assert.deepEqual(codigosDe(r), []);
  assert.equal(r.porItem[0].imprimible, true);
  assert.equal(r.imprimible, true);
});

test('ventana nivel A aprobada → imprimible', () => {
  const r = evaluarAptitudOrden(aprobada(itemDe(disenoConNivel('A'))));
  assert.deepEqual(codigosDe(r), []);
});

test('el veredicto coincide con el aptoParaCorte del motor en A, B y C', () => {
  for (const nivel of ['A', 'B', 'C']) {
    const it = itemDe(disenoConNivel(nivel));
    const r = evaluarAptitudOrden(aprobada(it));
    assert.equal(r.porItem[0].imprimible, it.resultado.aptoParaCorte === true, `nivel ${nivel}`);
  }
});

// ─── 1. Cotización aprobada ─────────────────────────────────────────────────

test('1 · cotización PENDIENTE bloquea con COTIZACION_NO_APROBADA', () => {
  const r = evaluarAptitudOrden({ estado: 'PENDIENTE', items: [itemDe(disenoConNivel('B'))] } as any);
  assert.deepEqual(codigosDe(r), ['COTIZACION_NO_APROBADA']);
  assert.equal(r.imprimible, false);
});

// ─── 2. Despiece por diseño ─────────────────────────────────────────────────

test('2 · ítem sin despiece (medidas libres) → SIN_DESPIECE_POR_DISENO y corta ahí', () => {
  const input = { ...BASE, sistema: '744', anchoCm: 150, altoCm: 120, cuerpos: 2, alasCorredizas: 1 };
  const item = { id: 1, moduloId: 'ventanas', input, resultado: calcularItem('ventanas', input) };
  assert.equal(item.resultado.cortes, undefined, 'una ventana por medidas libres no trae cortes');
  const r = evaluarAptitudOrden(aprobada(item));
  assert.deepEqual(codigosDe(r), ['SIN_DESPIECE_POR_DISENO']);
});

test('2 · pendiente y sin despiece muestra LAS DOS razones', () => {
  const r = evaluarAptitudOrden({ estado: 'PENDIENTE', items: [{ id: 1, input: {}, resultado: { items: [] } }] } as any);
  assert.deepEqual(codigosDe(r), ['COTIZACION_NO_APROBADA', 'SIN_DESPIECE_POR_DISENO']);
});

test('2 · un ítem sin despiece apaga el imprimible del conjunto, no el del ítem bueno', () => {
  const bueno = itemDe(disenoConNivel('B'), 1);
  const r = evaluarAptitudOrden(aprobada(bueno, { id: 2, input: {}, resultado: { items: [] } }));
  assert.equal(r.porItem[0].imprimible, true);
  assert.equal(r.porItem[1].imprimible, false);
  assert.equal(r.imprimible, false);
});

// ─── 3. Nivel ───────────────────────────────────────────────────────────────

test('3 · diseño nivel C → NIVEL_NO_VALIDADO y NO repite NO_APTO_PARA_CORTE', () => {
  const r = evaluarAptitudOrden(aprobada(itemDe(disenoConNivel('C'))));
  const codigos = codigosDe(r);
  assert.ok(codigos.includes('NIVEL_NO_VALIDADO'));
  assert.ok(!codigos.includes('NO_APTO_PARA_CORTE'), 'en C el nivel ya explica el no apto: un solo motivo');
});

test('3 · nivel DESCONOCIDO (blob viejo) bloquea y tampoco calla NO_APTO', () => {
  const it = itemDe(disenoConNivel('B'));
  const viejo = clonar(it);
  delete viejo.resultado.diseno.nivelCorte;
  const r = evaluarAptitudOrden(aprobada(viejo));
  const codigos = codigosDe(r);
  assert.ok(codigos.includes('NIVEL_NO_VALIDADO'));
  assert.ok(codigos.includes('NO_APTO_PARA_CORTE'), 'no saber el nivel no explica el no apto');
  assert.match(r.porItem[0].motivos.find((m) => m.codigo === 'NIVEL_NO_VALIDADO')!.texto, /desconocido/);
});

// ─── 4. Holgura ─────────────────────────────────────────────────────────────

test('4 · holgura "ausente" → HOLGURA_AUSENTE; "no-aplica" pasa', () => {
  const it = itemDe(disenoConNivel('B'));
  const ausente = clonar(it);
  ausente.resultado.medidas = { ...(ausente.resultado.medidas ?? {}), holgura: { origen: 'ausente' } };
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(ausente))).includes('HOLGURA_AUSENTE'));

  const noAplica = clonar(it);
  noAplica.resultado.medidas = { ...(noAplica.resultado.medidas ?? {}), holgura: { origen: 'no-aplica' } };
  assert.ok(!codigosDe(evaluarAptitudOrden(aprobada(noAplica))).includes('HOLGURA_AUSENTE'));
});

// ─── 5. Apto para corte — el artefacto del blob ─────────────────────────────

test('5 · blob B con aptoParaCorte:false GRABADO pero sin errores → se reevalúa y es imprimible', () => {
  // Las cotizaciones guardadas antes del 2026-09-19 tienen false por su nivel B.
  const viejo = clonar(itemDe(disenoConNivel('B')));
  viejo.resultado.aptoParaCorte = false;
  const r = evaluarAptitudOrden(aprobada(viejo));
  assert.deepEqual(codigosDe(r), []);
});

test('5 · B con una línea en error → NO_APTO_PARA_CORTE (nunca un bloqueo mudo)', () => {
  const malo = clonar(itemDe(disenoConNivel('B')));
  malo.resultado.items.push({ codigo: 'X', error: 'medida inválida' });
  const codigos = codigosDe(evaluarAptitudOrden(aprobada(malo)));
  assert.ok(codigos.includes('NO_APTO_PARA_CORTE'));
});

test('5 · blob sin `items`: se respeta el aptoParaCorte guardado', () => {
  const sinLineas = clonar(itemDe(disenoConNivel('B')));
  delete sinLineas.resultado.items;
  sinLineas.resultado.aptoParaCorte = false;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(sinLineas))).includes('NO_APTO_PARA_CORTE'));

  sinLineas.resultado.aptoParaCorte = true;
  assert.ok(!codigosDe(evaluarAptitudOrden(aprobada(sinLineas))).includes('NO_APTO_PARA_CORTE'));
});

// ─── 5b. Perfilería personalizada ───────────────────────────────────────────

test('5b · perfilería personalizada → PERFILERIA_PERSONALIZADA y se salta la condición 8', () => {
  const input = {
    ...BASE, anchoCm: 150, altoCm: 120, disenoId: disenoConNivel('B'),
    personalizacion: { extras: [{ codigo: 'JAM0108', medidaMm: 630, piezas: 2 }] },
  };
  const item = { id: 1, moduloId: 'ventanas', input, resultado: calcularItem('ventanas', input) };
  const codigos = codigosDe(evaluarAptitudOrden(aprobada(item)));
  assert.ok(codigos.includes('PERFILERIA_PERSONALIZADA'));
  assert.ok(!codigos.includes('DESPIECE_NO_VERIFICABLE'), 'sin falso "la estructura del diseño cambió"');
  assert.ok(!codigos.includes('MEDIDA_PERFIL_DESACTUALIZADA'));
});

// ─── 6. Errores de presupuesto ──────────────────────────────────────────────

test('6 · hayErrores true o AUSENTE → HAY_ERRORES_EN_ITEM (solo false explícito pasa)', () => {
  const it = itemDe(disenoConNivel('B'));
  const conErrores = clonar(it);
  conErrores.resultado.hayErrores = true;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(conErrores))).includes('HAY_ERRORES_EN_ITEM'));

  const sinCampo = clonar(it);
  delete sinCampo.resultado.hayErrores;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(sinCampo))).includes('HAY_ERRORES_EN_ITEM'));
});

// ─── 7. Sistema en producción (desactivada) ─────────────────────────────────

test('7 · desactivada: un sistema sin calibrar NO bloquea (EXIGIR_SISTEMA_EN_PRODUCCION = false)', () => {
  const r = evaluarAptitudOrden(aprobada(itemDe(disenoConNivel('B'))), {
    margenes: { pieza: {} } as any,
    sistemas: {} as any,
  });
  assert.ok(!codigosDe(r).includes('SISTEMA_NO_EN_PRODUCCION'));
});

// ─── 8. Despiece vigente ────────────────────────────────────────────────────

test('8 · una medida de perfil que cambió → MEDIDA_PERFIL_DESACTUALIZADA', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  v.resultado.cortes.perfiles[0].medidaMm += 5;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(v))).includes('MEDIDA_PERFIL_DESACTUALIZADA'));
});

test('8 · diferencia menor a 0,005 mm se tolera (ruido de coma flotante)', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  v.resultado.cortes.perfiles[0].medidaMm += 0.004;
  assert.deepEqual(codigosDe(evaluarAptitudOrden(aprobada(v))), []);
});

test('8 · un paño de vidrio que cambió → MEDIDA_VIDRIO_DESACTUALIZADA', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  assert.ok(v.resultado.cortes.vidrios.length > 0, 'el diseño elegido debe traer vidrio');
  v.resultado.cortes.vidrios[0].anchoMm += 3;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(v))).includes('MEDIDA_VIDRIO_DESACTUALIZADA'));
});

test('8 · cambió la cantidad de piezas → DESPIECE_NO_VERIFICABLE (estructura distinta)', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  v.resultado.cortes.perfiles.pop();
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(v))).includes('DESPIECE_NO_VERIFICABLE'));
});

test('8 · el diseño ya no existe en el catálogo → DESPIECE_NO_VERIFICABLE', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  v.input.disenoId = 'SistemaQueNoExiste::OX';
  v.resultado.diseno.id = 'SistemaQueNoExiste::OX';
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(v))).includes('DESPIECE_NO_VERIFICABLE'));
});

test('8 · faltan medidas en el input guardado → DESPIECE_NO_VERIFICABLE', () => {
  const v = clonar(itemDe(disenoConNivel('B')));
  delete (v.input as Blob).anchoCm;
  assert.ok(codigosDe(evaluarAptitudOrden(aprobada(v))).includes('DESPIECE_NO_VERIFICABLE'));
});

// ─── 9. Propuesta elegida ───────────────────────────────────────────────────

test('9 · varias propuestas sin elegida → SIN_PROPUESTA_ELEGIDA a nivel cotización', () => {
  const r = evaluarAptitudOrden({
    estado: 'APROBADA',
    propuestas: [
      { id: 1, etiqueta: 'A', elegida: false, items: [itemDe(disenoConNivel('B'))] },
      { id: 2, etiqueta: 'B', elegida: false, items: [itemDe(disenoConNivel('B'))] },
    ],
  } as any);
  assert.equal(r.imprimible, false);
  assert.deepEqual(r.porItem, []);
  assert.deepEqual(r.motivos.map((m) => m.codigo), ['SIN_PROPUESTA_ELEGIDA']);
});

test('9 · solo cuenta la elegida: una variante C descartada no bloquea la B elegida', () => {
  const r = evaluarAptitudOrden({
    estado: 'APROBADA',
    propuestas: [
      { id: 1, etiqueta: 'A', elegida: false, items: [itemDe(disenoConNivel('C'))] },
      { id: 2, etiqueta: 'B', elegida: true, items: [itemDe(disenoConNivel('B'))] },
    ],
  } as any);
  assert.equal(r.imprimible, true);
  assert.equal(r.porItem.length, 1);
});

test('cotización sin ítems no es imprimible', () => {
  const r = evaluarAptitudOrden(aprobada());
  assert.equal(r.imprimible, false);
  assert.deepEqual(r.porItem, []);
});
