// Pruebas de accesoriosPorDiseno (mismo patrón que humo.test: node:test,
// cero dependencias de runner). No valida los 430 precios uno por uno -- valida
// las tres reglas de negocio que importan: un MAPEADO cobra, un
// INSUMO_NO_FACTURADO no cobra pero no desaparece, y un PENDIENTE bloquea con
// error en vez de colarse en $0. Después recorre los 138 diseños reales para
// confirmar que la función nunca revienta, aunque produzca líneas en error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accesoriosPorDiseno, desgloseAccesorios } from "../../cotizador/lib/accesoriosPorDiseno";
import { getDiseno, listarDisenos } from "../../cotizador/lib/motorDespiece";

import { before, after } from "node:test";
import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";

// Los motores leen el catálogo y los diseños de la caché en memoria, que se
// alimenta de Postgres: hay que precargarla antes de la primera aserción.
before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });


/** Contexto sintético razonable: mismas claves que cotizarPorDiseno pasa de
 * verdad al callback `accesorios` (ver su JSDoc), a una medida fija de
 * 150x120 cm, en mate. */
function ctxDe(diseno: any, overrides: any = {}) {
  const alasCorredizas = (diseno.diseno.match(/X/g) || []).length;
  const anchoCm = overrides.anchoCm ?? 150;
  const altoCm = overrides.altoCm ?? 120;
  return {
    cuerpos: diseno.paneles || 1,
    alasCorredizas,
    anchoCm,
    altoCm,
    anchoVanoCm: anchoCm,
    altoVanoCm: altoCm,
    color: "mate",
    segmentoCliente: "PA",
    diseno,
    advertencias: [],
    cortes: { perfiles: [], vidrios: [] },
    areaVidrioM2: round2ish((anchoCm / 100) * (altoCm / 100)),
    perimetroVidrioM: round2ish(2 * (anchoCm / 100 + altoCm / 100)),
    ...overrides,
  };
}
function round2ish(n: number) {
  return Math.round(n * 100) / 100;
}

test('accesorio MAPEADO conocido ("Rodamiento 5020 Nylon") produce una línea de BOM sin error con el código RODA5020', () => {
  const diseno = getDiseno("Sistema5020::OX")!;
  assert.ok(diseno, "el diseño Sistema5020::OX debería existir en el catálogo de diseños");
  assert.ok(
    diseno.accesorios.some((a) => a.descripcion === "Rodamiento 5020 Nylon"),
    "este diseño debería traer Rodamiento 5020 Nylon en su seed"
  );

  const lineas = accesoriosPorDiseno(ctxDe(diseno));
  const rodamiento = lineas.find((l) => l.codigo === "RODA5020");
  assert.ok(rodamiento, 'debería haber una línea con código "RODA5020"');
  assert.equal(rodamiento.error, false);
  assert.equal(rodamiento.cantidad, 2, "Sistema5020::OX pide cantidad 2 de este accesorio en el seed");
  assert.ok(rodamiento.valorTotal > 0, "una línea MAPEADA nunca debería cobrar $0");
});

test('accesorio INSUMO_NO_FACTURADO ("Felpa") no produce línea de BOM cobrable, pero sí aparece en el desglose de insumos', () => {
  const diseno = getDiseno("Sistema5020::OX")!;
  assert.ok(
    diseno.accesorios.some((a) => a.descripcion === "Felpa"),
    "este diseño debería traer Felpa en su seed"
  );

  const lineas = accesoriosPorDiseno(ctxDe(diseno));
  assert.ok(
    !lineas.some((l) => l.codigo === "Felpa" || /felpa/i.test(l.descripcion ?? "")),
    "un insumo no facturado no debe aparecer como línea de BOM (ni cobrable ni en error)"
  );

  const desglose = desgloseAccesorios(diseno);
  const insumoFelpa = desglose.insumos.find((i) => i.descripcion === "Felpa");
  assert.ok(insumoFelpa, "Felpa debería quedar disponible en desgloseAccesorios().insumos para el documento de taller");
});

// Antes este test usaba "Cerrojo de Embutir", que dejó de servir de ejemplo el
// 2026-09-11: el Excel matriz lo arbitró a CPTOR y pasó a MAPEADO. Se cambió a
// "Cerrojo Media Luna", que sigue sin candidato en los 432 productos.
test('accesorio PENDIENTE ("Cerrojo Media Luna") produce una línea con error:true, nunca $0 en silencio', () => {
  const diseno = getDiseno("Sistema8025::XOX_BOLSILLO_CERROJOPR")!;
  assert.ok(
    diseno.accesorios.some((a) => a.descripcion === "Cerrojo Media Luna"),
    "este diseño debería traer Cerrojo Media Luna en su seed"
  );

  const lineas = accesoriosPorDiseno(ctxDe(diseno));
  const lineaPendiente = lineas.find((l) => l.codigo === "Cerrojo Media Luna");
  assert.ok(lineaPendiente, 'debería haber una línea visible para "Cerrojo Media Luna"');
  assert.equal(lineaPendiente.error, true);
  assert.equal(lineaPendiente.valorTotal, 0);
  assert.equal(lineaPendiente.precioUnitario, 0);

  const desglose = desgloseAccesorios(diseno);
  assert.ok(desglose.pendientes.some((p) => p.descripcion === "Cerrojo Media Luna"));
});

// Un mapeo restringido por `sistemas` debe BLOQUEAR en los demás sistemas, no
// cobrarles el código del sistema para el que se fijó. Es la red que evita que
// activar Sistema744 le cobre en silencio el empaque de 5020.
test("un mapeo restringido a otros sistemas bloquea con error:true en vez de cobrar el código ajeno", () => {
  const diseno = getDiseno("Sistema744::XX")!;
  const lineas = accesoriosPorDiseno(ctxDe(diseno, { anchoCm: 150, altoCm: 120 }));

  const empaque = lineas.find((l) => l.codigo === "E.universa. Empaque Universal");
  assert.ok(empaque, "el empaque restringido debe seguir siendo visible como línea");
  assert.equal(empaque.error, true);
  assert.equal(empaque.valorTotal, 0);
  assert.ok(
    !lineas.some((l) => l.codigo === "EMP5020"),
    "un diseño de Sistema744 nunca debe cobrar EMP5020, que es el empaque de 5020"
  );
});

test('descripción que no existe en el mapeo también bloquea con error:true (no sólo "PENDIENTE" explícito)', () => {
  const disenoFalso = {
    id: "TEST::FALSO",
    accesorios: [{ descripcion: "Esto no existe en mapeo-accesorios.json", cantidad: 3, formula: null }],
  };
  const lineas = accesoriosPorDiseno(ctxDe({ ...disenoFalso, diseno: "OX", paneles: 1 }));
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].error, true);
  assert.equal(lineas[0].valorTotal, 0);
});

test('Sistema744::XX (caso señalado en el análisis): mapeados/insumos/pendientes coinciden con lo esperado', () => {
  const diseno = getDiseno("Sistema744::XX");
  assert.ok(diseno);

  const desglose = desgloseAccesorios(diseno);
  // Desde el arbitraje contra el Excel matriz (2026-09-11), "Chapa de Impacto
  // Alpha" se cobra con CHJ0101 en 744 — el Excel confirmó que el código
  // hardcodeado siempre estuvo bien y que la descripción del diseño despistaba.
  const descripcionesMapeadas = desglose.mapeados.map((m) => m.descripcion).sort();
  assert.deepEqual(
    descripcionesMapeadas,
    ["Chapa de Impacto Alpha", "Guia Inferior 744", "Guia Superior 744", "Rodamiento 744"].sort()
  );

  const descripcionesInsumo = desglose.insumos.map((i) => i.descripcion).sort();
  assert.deepEqual(
    descripcionesInsumo,
    ["Felpa", "Tornillo n10 x 1 1_2", "Tornillo n8 x 1_2", "Tornillo n8 x 3_4"].sort()
  );

  // Sólo queda bloqueado el empaque, y no por falta de mapeo sino porque el
  // suyo está restringido a 5020 (la descripción del extractor es genérica y
  // significa un producto distinto en cada sistema).
  const descripcionesPendientes = desglose.pendientes.map((p) => p.descripcion).sort();
  assert.deepEqual(descripcionesPendientes, ["E.universa. Empaque Universal"]);

  // "Manija 744-8025" pasó a IGNORADO: el Excel matriz tampoco la cobra en
  // ventanas, así que no cobrarla nunca fue un olvido.
  const descripcionesIgnoradas = desglose.ignorados.map((i) => i.descripcion).sort();
  assert.deepEqual(descripcionesIgnoradas, ["Manija 744-8025"]);

  const lineas = accesoriosPorDiseno(ctxDe(diseno, { anchoCm: 150, altoCm: 120 }));
  const porCodigo = Object.fromEntries(lineas.filter((l) => !l.error).map((l) => [l.codigo, l]));
  assert.equal(porCodigo.ROD744.error, false);
  assert.equal(porCodigo.GSU0101.error, false);
  assert.equal(porCodigo.GIN0101.error, false);
  assert.equal(porCodigo.CHJ0101.error, false);
  // Las guías se cobran `alasCorredizas × 2`: en una XX de dos corredizas son 4,
  // no 2. Es el arbitraje del Excel sobre la discrepancia que estaba abierta.
  assert.equal(porCodigo.GSU0101.cantidad, 4);
  assert.equal(porCodigo.GIN0101.cantidad, 4);
  assert.equal(lineas.filter((l) => l.error).length, 1, "sólo el empaque restringido debe quedar en error");
});

test("accesoriosPorDiseno no lanza excepción para ninguno de los 138 diseños del catálogo", () => {
  const disenos = listarDisenos({ soloCotizables: false });
  assert.equal(disenos.length, 138);

  let totalLineas = 0;
  let totalErrores = 0;
  for (const resumen of disenos) {
    const diseno = getDiseno(resumen.id);
    assert.ok(diseno, `getDiseno debería resolver "${resumen.id}"`);

    assert.doesNotThrow(() => {
      const lineas = accesoriosPorDiseno(ctxDe(diseno));
      assert.ok(Array.isArray(lineas), `accesoriosPorDiseno debería devolver un array para "${resumen.id}"`);
      totalLineas += lineas.length;
      totalErrores += lineas.filter((l) => l.error).length;
    }, `accesoriosPorDiseno no debería lanzar para "${resumen.id}"`);

    assert.doesNotThrow(
      () => desgloseAccesorios(diseno),
      `desgloseAccesorios no debería lanzar para "${resumen.id}"`
    );
  }

  assert.ok(totalLineas > 0, "debería haberse producido al menos alguna línea en los 138 diseños combinados");
  // No es un assert de negocio (el punto es "no revienta"), sólo deja huella
  // legible en la salida de `node --test` de cuánto del seed sigue pendiente.
  console.log(`    (${totalErrores}/${totalLineas} líneas en error sobre los 138 diseños: refleja cuánto queda PENDIENTE hoy)`);
});
