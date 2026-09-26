// Pruebas del módulo "Ítem libre" (`cotizador/modules/itemLibre.ts`), el 7º
// motor: el ítem que el asesor arma línea por línea con cualquier código del
// catálogo, portado de los trece bloques "PLANTILLAS" de la hoja
// `Formato Digital` del Excel de los asesores.
//
// ESTA SUITE SÍ PRECARGA LA CACHÉ (a diferencia de generadorSapPerfileria, que
// prueba una función pura): el módulo resuelve precios reales con
// `lineaCatalogo()` y parámetros globales con `getParametros()`, los dos contra
// la caché en memoria que se alimenta de Postgres.
//
// ⚠️ Bajar el backend dev antes de correrlas: son 15 conexiones en el pooler en
// modo sesión y `npm run dev` ya tiene las suyas abiertas (ver
// docs/modulos/cotizador.md → "Bajar el backend dev antes de correrlas").
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { calcular, claseDeUnidad, meta } from "../../cotizador/modules/itemLibre";
import { getParametros } from "../../cotizador/lib/catalogo";
import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

// Códigos reales del catálogo, uno por clase de unidad. Si alguno desapareciera
// del catálogo la prueba falla con un mensaje claro en vez de un NaN silencioso.
const VIDRIO_M2 = "CL6MM03SP";      // X M2    — vidrio templado 6 mm
const PERFIL_ML = "CAB0102";        // X METRO — 5020 cabezal 144 mate
const ACCESORIO_UND = "BES0302";    // UND     — barra estabilizadora (eje 7/16)

// PERF01/02/03 estuvieron como `X METRO` hasta el 2026-09-26, cuando pasaron a
// `UND` (precio por perforación, como factura el proveedor). ELE1101 no se
// revisó: antes de usar un código como ejemplo de "UND", mirar su unidad real.

function base(extra: Record<string, unknown> = {}) {
  return {
    descripcionItem: "Fachada oficina 2º piso",
    segmentoCliente: "PA",
    cantidadPiezas: 1,
    lineas: [{ codigo: VIDRIO_M2, cantidad: 4 }],
    ...extra,
  };
}

// ─── Contrato del módulo ────────────────────────────────────────────────────

test("declara los 4 campos del formulario, con `lineas` requerido", () => {
  const nombres = meta.campos.map((c) => c.nombre);
  assert.deepEqual(nombres, ["descripcionItem", "segmentoCliente", "lineas", "cantidadPiezas"]);
  const lineas = meta.campos.find((c) => c.nombre === "lineas")!;
  assert.equal(lineas.tipo, "lineas");
  assert.equal(lineas.requerido, true);
});

test("NO declara descuentoPct: desde el 2026-09-20 el descuento vive en la propuesta", () => {
  assert.equal(meta.campos.some((c) => c.nombre === "descuentoPct"), false);
});

test("NO declara los campos clonables (vidrio/película/matizado)", () => {
  // Es lo que hace que `clonarPropuesta` copie un ítem libre intacto con una
  // advertencia legible en vez de intentar recalcularlo: `moduloAcepta()` mira
  // exactamente esta lista. Si algún día se declaran, hay que revisar el clonado.
  for (const campo of ["codigoVidrio", "pelicula", "matizado"]) {
    assert.equal(meta.campos.some((c) => c.nombre === campo), false, `no debería declarar ${campo}`);
  }
});

// ─── Clasificación de unidades ──────────────────────────────────────────────

test("clasifica las cuatro unidades reales del catálogo", () => {
  assert.equal(claseDeUnidad("X M2"), "area");
  assert.equal(claseDeUnidad("X METRO"), "lineal");
  assert.equal(claseDeUnidad("ML"), "lineal");
  assert.equal(claseDeUnidad("UND"), "unidad");
});

test("tolera variantes de escritura y no revienta con unidad ausente", () => {
  assert.equal(claseDeUnidad("  x   m2  "), "area");
  assert.equal(claseDeUnidad("M2"), "area");
  assert.equal(claseDeUnidad("metro lineal"), "lineal");
  // Sin unidad cae a "unidad": cobra cantidad × precio, que es lo más inocuo.
  assert.equal(claseDeUnidad(null), "unidad");
  assert.equal(claseDeUnidad(undefined), "unidad");
  assert.equal(claseDeUnidad(""), "unidad");
});

// ─── Cálculo ────────────────────────────────────────────────────────────────

test("una línea de vidrio da total positivo, sin errores y con AIU aplicado", () => {
  const r = calcular(base());
  assert.equal(r.hayErrores, false);
  assert.ok(r.subtotalPieza > 0, `subtotalPieza debería ser positivo, dio ${r.subtotalPieza}`);
  // subtotalConAiu = subtotal / aiu, y aiu es 0,96 -> el resultado es MAYOR.
  // Es la trampa documentada: el AIU se DIVIDE, no se multiplica.
  assert.equal(r.aiu, getParametros().aiu);
  assert.ok(r.subtotalConAiu > r.subtotal, "el AIU debe subir el subtotal, no bajarlo");
});

test("mezcla las tres clases de unidad en un mismo ítem", () => {
  const r = calcular(base({
    lineas: [
      { codigo: VIDRIO_M2, cantidad: 2.5 },
      { codigo: PERFIL_ML, cantidad: 7 },
      { codigo: ACCESORIO_UND, cantidad: 4 },
    ],
  }));
  assert.equal(r.hayErrores, false);
  assert.equal(r.items.length, 3);
  // Cada línea conserva la unidad que declara el catálogo: no se sobreescribe.
  const unidades = r.items.map((i) => claseDeUnidad(i.unidad));
  assert.deepEqual(unidades, ["area", "lineal", "unidad"]);
});

test("areaM2 suma SOLO las líneas que se cotizan por metro cuadrado", () => {
  const r = calcular(base({
    lineas: [
      { codigo: VIDRIO_M2, cantidad: 2.5 },
      { codigo: PERFIL_ML, cantidad: 7 },      // no suma: es lineal
      { codigo: ACCESORIO_UND, cantidad: 4 },  // no suma: son unidades
    ],
  }));
  assert.equal(r.areaM2, 2.5);
});

test("REGRESIÓN bug #10: cantidadPiezas multiplica UNA sola vez", () => {
  const una = calcular(base({ cantidadPiezas: 1 }));
  const cinco = calcular(base({ cantidadPiezas: 5 }));
  // El subtotal de UNA pieza no cambia; sólo el del conjunto se multiplica.
  assert.equal(cinco.subtotalPieza, una.subtotalPieza);
  assert.equal(cinco.subtotal, una.subtotalPieza * 5);
});

test("NO emite `cortes`: un ítem libre no tiene despiece ni plano", () => {
  // Es lo que hace que `aptitudOrden` lo marque SIN_DESPIECE_POR_DISENO y que la
  // Hoja de Trabajo imprima sus avisos, sin tocar ninguno de los dos.
  const r = calcular(base()) as Record<string, unknown>;
  assert.equal("cortes" in r, false);
});

test("NO agrega SMO ni flete al BOM: son cargos de la propuesta", () => {
  // Si volvieran al BOM, `totalizar()` los multiplicaría por cantidadPiezas y
  // cinco piezas cobrarían cinco fletes — el bug medido el 2026-09-20.
  const r = calcular(base({ cantidadPiezas: 5 }));
  const codigos = r.items.map((i) => i.codigo);
  for (const codigo of ["SMO01", "SMO02", "SMO03", "SMO04", "GTFA26"]) {
    assert.equal(codigos.includes(codigo), false, `${codigo} no debería estar en el BOM`);
  }
});

// ─── Errores y advertencias ─────────────────────────────────────────────────

test("un código inexistente marca la línea en error y no cobra $0 en silencio", () => {
  const r = calcular(base({ lineas: [{ codigo: "NO_EXISTE_XYZ", cantidad: 3 }] }));
  assert.equal(r.hayErrores, true);
  assert.equal(r.items[0].error, true);
  assert.equal(r.items[0].valorTotal, 0);
});

test("sin líneas no calcula, y lo dice en español", () => {
  assert.throws(() => calcular(base({ lineas: [] })), /al menos una línea/i);
  assert.throws(() => calcular(base({ lineas: undefined })), /al menos una línea/i);
});

test("una línea sin código o con cantidad inválida señala el número de línea", () => {
  assert.throws(
    () => calcular(base({ lineas: [{ codigo: VIDRIO_M2, cantidad: 1 }, { codigo: "", cantidad: 2 }] })),
    /línea 2/i
  );
  assert.throws(
    () => calcular(base({ lineas: [{ codigo: VIDRIO_M2, cantidad: 0 }] })),
    /línea 1/i
  );
  assert.throws(
    () => calcular(base({ lineas: [{ codigo: VIDRIO_M2, cantidad: -5 }] })),
    /mayor a 0/i
  );
});

test("el código en minúscula se normaliza y encuentra el producto", () => {
  const r = calcular(base({ lineas: [{ codigo: VIDRIO_M2.toLowerCase(), cantidad: 2 }] }));
  assert.equal(r.hayErrores, false);
  assert.equal(r.items[0].codigo, VIDRIO_M2);
});

test("un código repetido no se rechaza pero se advierte", () => {
  const r = calcular(base({
    lineas: [{ codigo: VIDRIO_M2, cantidad: 2 }, { codigo: VIDRIO_M2, cantidad: 3 }],
  }));
  assert.equal(r.hayErrores, false);
  assert.equal(r.items.length, 2, "las dos líneas se conservan, no se fusionan");
  assert.ok(
    r.advertencias.some((a) => a.includes(VIDRIO_M2) && /2 veces/.test(a)),
    `debería advertir del código repetido, dio: ${JSON.stringify(r.advertencias)}`
  );
});

test("un ítem sin nombre advierte que el cliente verá el rótulo genérico", () => {
  const r = calcular(base({ descripcionItem: "   " }));
  assert.ok(
    r.advertencias.some((a) => /item-libre #N/.test(a)),
    `debería advertir de la falta de nombre, dio: ${JSON.stringify(r.advertencias)}`
  );
});

test("rechaza segmento y cantidadPiezas inválidos", () => {
  assert.throws(() => calcular(base({ segmentoCliente: "PX" })), /segmentoCliente/);
  assert.throws(() => calcular(base({ cantidadPiezas: 0 })), /cantidadPiezas/);
  assert.throws(() => calcular(base({ cantidadPiezas: 2.5 })), /cantidadPiezas/);
});

test("rechaza más líneas de las que admite un ítem", () => {
  const muchas = Array.from({ length: 41 }, () => ({ codigo: VIDRIO_M2, cantidad: 1 }));
  assert.throws(() => calcular(base({ lineas: muchas })), /hasta 40 líneas/i);
});
