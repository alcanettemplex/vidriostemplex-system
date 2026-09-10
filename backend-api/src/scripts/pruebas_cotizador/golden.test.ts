// Golden master del port: los motores portados a TypeScript deben producir
// EXACTAMENTE los mismos resultados que los del proyecto standalone de origen.
//
// El archivo de referencia lo genera `scratchpad/golden/generar.mjs`, que
// ejecuta los motores originales (JavaScript ESM, leyendo sus JSON de disco).
// Aquí se reproduce la misma batería contra el port (TypeScript, leyendo de
// Postgres a través de la caché) y se comparan uno a uno.
//
// Es la única forma honesta de afirmar que 4.800 líneas convertidas a mano no
// cambiaron ninguna regla de negocio: cubre los 138 diseños del catálogo a dos
// medidas, sus planos, el desglose de accesorios, el catálogo de precios
// resuelto y los 6 módulos de producto.
//
// Los artefactos NO viven en el repo: se leen de COTIZADOR_GOLDEN_DIR. Sin esa
// variable el archivo entero se salta, para que nunca rompa a quien no los
// tenga generados.
//
// Uso:
//   COTIZADOR_GOLDEN_DIR=<ruta> node -r ts-node/register --test src/scripts/pruebas_cotizador/golden.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { sequelize } from '../../models';
import * as cache from '../../cotizador/cache';
import { listarDisenos, getDiseno, calcularDespiece } from '../../cotizador/lib/motorDespiece';
import { cotizarPorDiseno } from '../../cotizador/lib/cotizarPorDiseno';
import { calcularPlano } from '../../cotizador/lib/planoProducto';
import { parsearCodigo } from '../../cotizador/lib/codigoDiseno';
import {
  listarCatalogo,
  listarProvisionales,
  getParametros,
} from '../../cotizador/lib/catalogo';
import { desgloseAccesorios } from '../../cotizador/lib/accesoriosPorDiseno';
import { MODULOS } from '../../cotizador/modules/registry';

const DIR = process.env.COTIZADOR_GOLDEN_DIR;
const hayGolden = Boolean(DIR && existsSync(path.join(DIR, 'despieces.json')));

/**
 * El generador deja el JSON de referencia ya neutralizado en sus dos únicas
 * divergencias deliberadas, ambas de texto: la mención al software externo del
 * que salieron los precios provisionales (que no puede entrar al ERP, y que la
 * Etapa 1 ya reemplazó al sembrar la base) y la mención, dentro del motivo de
 * un plano, al archivo JSON donde el standalone guardaba las correcciones de
 * geometría — en el ERP eso es una tabla, y ese mensaje lo lee un vendedor.
 *
 * Todo lo demás se compara literal: cualquier otra divergencia, y en particular
 * cualquier número, hace fallar la prueba.
 */
function ref<T = unknown>(nombre: string): T {
  return JSON.parse(readFileSync(path.join(DIR as string, nombre + '.json'), 'utf8'));
}

/** Pasa el valor del port por JSON antes de comparar, igual que hizo el
 * generador con el del origen: así `undefined` y claves omitidas se comportan
 * idénticamente en ambos lados y la comparación mide los motores, no el
 * serializador. */
function normalizar<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v ?? null));
}

const MEDIDAS = [
  { anchoCm: 120, altoCm: 100 },
  { anchoCm: 80, altoCm: 210 },
];

before(async () => {
  if (!hayGolden) return;
  await cache.precargar();
});

after(async () => {
  if (!hayGolden) return;
  await sequelize.close();
});

test('catálogo resuelto idéntico al del origen (430 productos)', { skip: !hayGolden }, () => {
  assert.deepStrictEqual(normalizar(listarCatalogo()), ref('catalogo'));
});

test('provisionales idénticos (126)', { skip: !hayGolden }, () => {
  assert.deepStrictEqual(normalizar(listarProvisionales()), ref('provisionales'));
});

test('parámetros globales idénticos', { skip: !hayGolden }, () => {
  assert.deepStrictEqual(normalizar(getParametros()), ref('parametros'));
});

test('listarDisenos idéntico (138)', { skip: !hayGolden }, () => {
  assert.deepStrictEqual(
    normalizar(listarDisenos({ soloCotizables: false })),
    ref('disenos_listado')
  );
});

test('parsearCodigo idéntico en los 138 diseños', { skip: !hayGolden }, () => {
  const esperado = ref<Array<{ id: string; resultado: unknown }>>('codigos');
  for (const caso of esperado) {
    const d = getDiseno(caso.id);
    assert.ok(d, `el diseño ${caso.id} no está en la caché`);
    assert.deepStrictEqual(
      normalizar(parsearCodigo(d.diseno, { modulo: d.modulo })),
      caso.resultado,
      `parsearCodigo difiere en ${caso.id}`
    );
  }
});

test('DESPIECE idéntico en los 138 diseños × 2 medidas', { skip: !hayGolden }, () => {
  const esperado = ref<Array<{ etiqueta: string; resultado: unknown }>>('despieces');
  let i = 0;
  for (const id of esperado.map((e) => e.etiqueta.split('@')[0]).filter((v, k, a) => a.indexOf(v) === k)) {
    for (const m of MEDIDAS) {
      const caso = esperado[i++];
      const obtenido = calcularDespiece({
        disenoId: id,
        anchoCm: m.anchoCm,
        altoCm: m.altoCm,
        colorPerfileria: 'mate',
        segmentoCliente: 'PA',
      });
      assert.deepStrictEqual(
        normalizar(obtenido),
        caso.resultado,
        `despiece difiere en ${caso.etiqueta}`
      );
    }
  }
  assert.equal(i, esperado.length, 'no se compararon todos los casos');
});

test('COTIZACIÓN idéntica en los 138 diseños × 2 medidas', { skip: !hayGolden }, () => {
  const esperado = ref<Array<{ etiqueta: string; resultado: unknown }>>('cotizaciones');
  for (const caso of esperado) {
    const [id, medida] = caso.etiqueta.split('@');
    const [anchoCm, altoCm] = medida.split('x').map(Number);
    const obtenido = cotizarPorDiseno({
      disenoId: id,
      anchoCm,
      altoCm,
      medidaEs: 'fabricacion',
      colorPerfileria: 'mate',
      segmentoCliente: 'PA',
      cantidadPiezas: 1,
    });
    assert.deepStrictEqual(
      normalizar(obtenido),
      caso.resultado,
      `cotización difiere en ${caso.etiqueta}`
    );
  }
});

test('PLANO idéntico en los 138 diseños × 2 medidas', { skip: !hayGolden }, () => {
  const esperado = ref<Array<{ etiqueta: string; resultado: unknown }>>('planos');
  for (const caso of esperado) {
    const [id, medida] = caso.etiqueta.split('@');
    const [anchoCm, altoCm] = medida.split('x').map(Number);
    const d = getDiseno(id);
    assert.ok(d, `el diseño ${id} no está en la caché`);
    const despiece = calcularDespiece({
      disenoId: id,
      anchoCm,
      altoCm,
      colorPerfileria: 'mate',
      segmentoCliente: 'PA',
    });
    const obtenido = calcularPlano({
      codigoDiseno: d.diseno,
      modulo: d.modulo,
      anchoFabMm: anchoCm * 10,
      altoFabMm: altoCm * 10,
      vidrios: despiece.cortes?.vidrios ?? [],
      disenoId: id,
    });
    assert.deepStrictEqual(normalizar(obtenido), caso.resultado, `plano difiere en ${caso.etiqueta}`);
  }
});

test('desglose de accesorios idéntico en los 138 diseños', { skip: !hayGolden }, () => {
  const esperado = ref<Array<{ id: string; resultado: unknown }>>('accesorios');
  for (const caso of esperado) {
    assert.deepStrictEqual(
      normalizar(desgloseAccesorios(getDiseno(caso.id))),
      caso.resultado,
      `desglose difiere en ${caso.id}`
    );
  }
});

test('los 6 módulos de producto dan resultados idénticos', { skip: !hayGolden }, () => {
  const esperado = ref<
    Array<{ id: string; _input: Record<string, unknown>; meta: unknown; resultado: unknown; error: string | null }>
  >('modulos');
  assert.equal(esperado.length, 6, 'el golden no trae los 6 módulos');

  for (const caso of esperado) {
    const mod = MODULOS[caso.id as keyof typeof MODULOS];
    assert.ok(mod, `el módulo "${caso.id}" no está en el registry del port`);

    // El `meta` es el contrato que consume el formulario del frontend: si
    // cambia, la Etapa 3 se construiría contra una forma equivocada.
    assert.deepStrictEqual(normalizar(mod.meta), caso.meta, `meta difiere en ${caso.id}`);

    let resultado: unknown = null;
    let error: string | null = null;
    try {
      resultado = mod.calcular(caso._input);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    assert.equal(error, caso.error, `el error difiere en ${caso.id}`);
    assert.deepStrictEqual(normalizar(resultado), caso.resultado, `resultado difiere en ${caso.id}`);
  }
});
