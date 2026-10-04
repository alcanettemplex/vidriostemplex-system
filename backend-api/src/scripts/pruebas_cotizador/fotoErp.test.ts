// Foto del ERP — red de regresión de los 163 diseños (2026-10-03).
//
// REEMPLAZA al golden master (`golden.test.ts`, borrado ese día), que comparaba
// contra los motores del software standalone de ORIGEN. El ERP se apartó de
// ellos a propósito más de diez veces (espejo, cerrojo, alfajía, pieza entera,
// mano de obra, Glasvit…): regenerarlo no tenía sentido y llevaba desde el
// 2026-09-11 sin vigilar nada.
//
// Esta prueba compara contra el ERP MISMO: una foto de lo que hoy calcula para
// cada diseño a cuatro combinaciones de medida/color, guardada en
// `foto/fotoErp.json` dentro del repo. Si un cambio mueve una pieza, un código o
// una cantidad, esto falla y dice qué diseño y qué campo.
//
// QUÉ GUARDA Y QUÉ NO
//   · Sí: nivel, apto para corte, cortes de perfil (ref, código, medida, cantidad),
//     paños de vidrio, BOM (código + cantidad), huella del plano y el resultado
//     del módulo completo (`calcularItem`, con sus accesorios y reglas propias).
//   · NO guarda PRECIOS: cambian con cada factura que entra por Proveedores y la
//     prueba fallaría sin motivo. El precio se verifica aparte por COHERENCIA
//     (cada línea = cantidad × precio unitario, ningún precio en cero, totales
//     que cuadran), que es lo que de verdad puede romper un cambio de código.
//
// CUANDO UN CAMBIO ES INTENCIONAL (una holgura nueva, un accesorio que se agrega
// a un sistema, un diseño que cambia de nivel): regenerar la foto y revisar el
// diff de git, que muestra exactamente qué diseños y piezas cambiaron.
//
//     npm --prefix backend-api run test:cotizador:foto:actualizar
//
// Una medida NO redonda (903 × 601 mm) va a propósito: es la que destapa los
// truncamientos que las medidas múltiplos de 100 esconden (ver cotizador.md →
// "Por qué existe el nivel B").
//
// Precarga la caché (Postgres) — no escribe en la base.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { sequelize } from '../../models';
import * as cache from '../../cotizador/cache';
import { listarDisenos, getDiseno, calcularDespiece } from '../../cotizador/lib/motorDespiece';
import { calcularPlano } from '../../cotizador/lib/planoProducto';
import { desgloseAccesorios } from '../../cotizador/lib/accesoriosPorDiseno';
import { calcularItem } from '../../cotizador/modules/registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ARCHIVO = path.join(__dirname, 'foto', 'fotoErp.json');
// Por nombre del script de npm (funciona igual en la consola de Windows, que no
// admite `VAR=1 comando`) o por variable de entorno.
const ACTUALIZAR =
  process.env.npm_lifecycle_event === 'test:cotizador:foto:actualizar' || process.env.COTIZADOR_FOTO_ACTUALIZAR === '1';

const COMBINACIONES = [
  { anchoCm: 120, altoCm: 100, color: 'mate' },
  { anchoCm: 90.3, altoCm: 60.1, color: 'mate' },
  { anchoCm: 240, altoCm: 150, color: 'mate' },
  { anchoCm: 120, altoCm: 100, color: 'negro' },
];
const VIDRIO = 'CL4MM01CR';
const SEGMENTO = 'PA';
/** Campos obligatorios propios de un módulo (el resto usa la entrada común). */
const EXTRA_POR_MODULO: Record<string, Record<string, unknown>> = { espejo: { acabado: 'BPB' } };

const r4 = (n: unknown) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10000) / 10000 : null);
const huella = (v: unknown) => createHash('sha1').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 12);

/** BOM sin precios: lo que se pide, no lo que cuesta hoy. */
const bomSinPrecio = (items: any[] = []) =>
  items.map((l) => [l.codigo, r4(l.cantidad), l.unidad ?? '', l.error ? 'ERROR' : ''] as const);

function fotoDeCaso(disenoId: string, c: (typeof COMBINACIONES)[number]) {
  const d = getDiseno(disenoId)!;
  const despiece: any = calcularDespiece({
    disenoId, anchoCm: c.anchoCm, altoCm: c.altoCm, colorPerfileria: c.color, codigoVidrio: VIDRIO, segmentoCliente: SEGMENTO,
  });
  const plano = calcularPlano({
    codigoDiseno: d.diseno, modulo: d.modulo, anchoFabMm: c.anchoCm * 10, altoFabMm: c.altoCm * 10,
    vidrios: despiece.cortes?.vidrios ?? [], disenoId, overrides: cache.getGeometriaOverrides(),
  } as any);

  // El módulo completo: accesorios, mano de obra en el BOM, reglas por sistema.
  let modulo: Record<string, unknown>;
  try {
    const it: any = calcularItem(d.modulo, {
      disenoId, anchoCm: c.anchoCm, altoCm: c.altoCm, colorPerfileria: c.color, codigoVidrio: VIDRIO,
      segmentoCliente: SEGMENTO, cantidadPiezas: 1, conInstalacion: true, ...EXTRA_POR_MODULO[d.modulo],
    });
    modulo = {
      bom: bomSinPrecio(it.items),
      hayErrores: Boolean(it.hayErrores),
      apto: it.aptoParaCorte ?? null,
      cortesPerfil: (it.cortes?.perfiles ?? []).length,
      descripcion: it.descripcionComercial ?? null,
    };
  } catch (e) {
    modulo = { error: e instanceof Error ? e.message : String(e) };
  }

  return {
    nivel: d.nivelCorte ?? null,
    apto: despiece.aptoParaCorte ?? null,
    perfiles: (despiece.cortes?.perfiles ?? []).map((p: any) => [p.ref, p.codigo ?? null, r4(p.medidaMm), r4(p.cantidad), p.nivelCorte ?? null]),
    vidrios: (despiece.cortes?.vidrios ?? []).map((v: any) => [r4(v.anchoMm), r4(v.altoMm), r4(v.cantidad)]),
    bom: bomSinPrecio(despiece.items),
    plano: huella(plano),
    modulo,
  };
}

function tomarFoto() {
  const disenos = listarDisenos({ soloCotizables: false }).map((d) => d.id).sort();
  const casos: Record<string, unknown> = {};
  const accesorios: Record<string, unknown> = {};
  for (const id of disenos) {
    for (const c of COMBINACIONES) casos[`${id}@${c.anchoCm}x${c.altoCm}@${c.color}`] = fotoDeCaso(id, c);
    accesorios[id] = huella(desgloseAccesorios(getDiseno(id)));
  }
  return { disenos: disenos.length, combinaciones: COMBINACIONES, casos, accesorios };
}

let actual: ReturnType<typeof tomarFoto>;

before(async () => {
  await cache.precargar();
  actual = tomarFoto();
  if (ACTUALIZAR) {
    mkdirSync(path.dirname(ARCHIVO), { recursive: true });
    // Una entrada por línea: el diff de git muestra el caso que cambió y no un bloque entero.
    const lineas = (obj: Record<string, unknown>) =>
      Object.entries(obj).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
    const texto =
      '{\n' +
      `  "nota": "Foto del ERP generada por fotoErp.test.ts. NO editar a mano: regenerar con npm run test:cotizador:foto:actualizar y revisar el diff.",\n` +
      `  "disenos": ${actual.disenos},\n` +
      `  "combinaciones": ${JSON.stringify(actual.combinaciones)},\n` +
      `  "casos": {\n${lineas(actual.casos)}\n  },\n` +
      `  "accesorios": {\n${lineas(actual.accesorios)}\n  }\n}\n`;
    writeFileSync(ARCHIVO, texto, 'utf8');
    console.log(`[foto] ${Object.keys(actual.casos).length} casos escritos en ${ARCHIVO}`);
  }
});
after(async () => { await sequelize.close(); });

// ─── Comparación contra la foto ─────────────────────────────────────────────

test('la foto existe (si no, generarla con test:cotizador:foto:actualizar)', () => {
  assert.ok(existsSync(ARCHIVO), `No existe ${ARCHIVO}. Genérala con: npm run test:cotizador:foto:actualizar`);
});

test('mismos diseños que en la foto (ni uno de más, ni uno de menos)', () => {
  const foto = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
  const enFoto = Object.keys(foto.accesorios).sort();
  const hoy = Object.keys(actual.accesorios).sort();
  assert.deepStrictEqual(
    { faltan: enFoto.filter((x) => !hoy.includes(x)), sobran: hoy.filter((x) => !enFoto.includes(x)) },
    { faltan: [], sobran: [] },
    'el catálogo de diseños cambió: si es intencional, regenera la foto'
  );
});

test('cada diseño × medida × color calcula EXACTAMENTE lo mismo que en la foto', () => {
  const foto = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
  const distintos: string[] = [];
  for (const [clave, esperado] of Object.entries<any>(foto.casos)) {
    const obtenido: any = (actual.casos as any)[clave];
    if (!obtenido) continue; // lo reporta la prueba de "mismos diseños"
    for (const campo of Object.keys(esperado)) {
      if (JSON.stringify(obtenido[campo]) !== JSON.stringify(esperado[campo])) distintos.push(`${clave} → ${campo}`);
    }
  }
  assert.deepStrictEqual(
    distintos.slice(0, 40),
    [],
    `${distintos.length} diferencia(s) contra la foto. Si el cambio es intencional, regenera la foto y revisa el diff.`
  );
});

test('el desglose de accesorios de cada diseño es el de la foto', () => {
  const foto = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
  const distintos = Object.entries<string>(foto.accesorios)
    .filter(([id, h]) => (actual.accesorios as any)[id] !== undefined && (actual.accesorios as any)[id] !== h)
    .map(([id]) => id);
  assert.deepStrictEqual(distintos, []);
});

// ─── Coherencia de precios (no se fotografían: se verifican) ────────────────

test('coherencia de precios: cada línea = cantidad × precio, sin precios en cero, totales que cuadran', () => {
  const problemas: string[] = [];
  for (const id of listarDisenos({ soloCotizables: false }).map((d) => d.id)) {
    const d = getDiseno(id)!;
    let it: any;
    try {
      it = calcularItem(d.modulo, {
        disenoId: id, anchoCm: 120, altoCm: 100, colorPerfileria: 'mate', codigoVidrio: VIDRIO,
        segmentoCliente: SEGMENTO, cantidadPiezas: 2, conInstalacion: true, ...EXTRA_POR_MODULO[d.modulo],
      });
    } catch {
      continue; // el error ya queda fotografiado en `modulo.error`
    }
    for (const l of it.items ?? []) {
      if (l.error) continue;
      if (!(l.precioUnitario > 0)) problemas.push(`${id}: ${l.codigo} sin precio`);
      const esperado = Math.round(l.precioUnitario * l.cantidad * 100) / 100;
      if (Math.abs(l.valorTotal - esperado) > 0.011) problemas.push(`${id}: ${l.codigo} ${l.valorTotal} ≠ ${esperado}`);
    }
    const suma = Math.round((it.items ?? []).reduce((a: number, l: any) => a + l.valorTotal, 0) * 100) / 100;
    if (Math.abs(it.subtotalPieza - suma) > 0.011) problemas.push(`${id}: subtotalPieza ${it.subtotalPieza} ≠ Σ líneas ${suma}`);
    if (Math.abs(it.subtotal - Math.round(it.subtotalPieza * 2 * 100) / 100) > 0.011) problemas.push(`${id}: subtotal ≠ pieza × 2`);
    if (!(it.subtotalConAiu >= it.subtotal)) problemas.push(`${id}: el AIU bajó el subtotal (¿se multiplicó en vez de dividir?)`);
  }
  assert.deepStrictEqual(problemas.slice(0, 40), []);
});
