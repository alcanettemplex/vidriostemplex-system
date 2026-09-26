// Productos con precio a cotizar y costos de los kits que estaban en $0
// (script `2026-09-26_cotizador_precios_kits_y_perforaciones.ts`).
//
// - KVE001 y los vidrios sobre pedido CL4MM03LM / CL4MM08SP no tienen precio de
//   catálogo: el asesor escribe el COSTO del proveedor y el motor aplica el
//   multiplicador de la categoría para el segmento. Sin costo, la línea bloquea.
// - KDE0303 / KDE0304 / SDR0301 / CM572A ya tienen costo Templex.
// - PERF01/02/03 se cobran por unidad.
//
// Precarga la caché (abre conexión): correrla con el backend dev abajo, o sola
// — ver "Bajar el backend dev antes de correrlas" en docs/modulos/cotizador.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { getMultiplicador, getPrecio, getProducto } from "../../cotizador/lib/catalogo";
import { calcularItem } from "../../cotizador/modules/registry";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

type Linea = { codigo: string; cantidad: number; precioUnitario: number; error: boolean; precioACotizar?: boolean; costoManual?: number; descripcion: string };
type Resultado = { items: Linea[]; hayErrores: boolean; advertencias: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

function itemLibre(lineas: Record<string, unknown>[], extra: Record<string, unknown> = {}): Resultado {
  return calcularItem("item-libre", {
    descripcionItem: "Prueba precio a cotizar",
    segmentoCliente: "PA",
    cantidadPiezas: 1,
    lineas,
    ...extra,
  } as never) as Resultado;
}

test("los tres productos quedaron marcados como precio a cotizar", () => {
  for (const codigo of ["KVE001", "CL4MM03LM", "CL4MM08SP"]) {
    assert.equal(getProducto(codigo)?.precioACotizar, true, codigo);
  }
  // Un producto normal no lleva la clave (el golden master compara claves).
  assert.equal("precioACotizar" in getProducto("BES0302")!, false);
});

test("sin costo escrito, KVE001 bloquea el ítem con un mensaje que dice qué hacer", () => {
  const r = itemLibre([{ codigo: "KVE001", cantidad: 1 }]);
  assert.equal(r.hayErrores, true);
  const linea = r.items.find((l) => l.codigo === "KVE001")!;
  assert.equal(linea.error, true);
  assert.equal(linea.precioACotizar, true);
  assert.match(linea.descripcion, /se cotiza aparte/);
});

test("con costo escrito, el precio es costo × multiplicador del segmento", () => {
  const m = getMultiplicador("ACCESORIO")!;
  for (const [segmento, factor] of [["PA", m.pa], ["PM", m.pm], ["PB", m.pb]] as const) {
    const r = itemLibre([{ codigo: "KVE001", cantidad: 2, costo: 100000 }], { segmentoCliente: segmento });
    assert.equal(r.hayErrores, false, segmento);
    const linea = r.items[0];
    assert.equal(linea.precioUnitario, round2(100000 * factor), segmento);
    assert.equal(linea.costoManual, 100000);
    assert.ok(r.advertencias.some((a) => a.includes("KVE001") && a.includes("costo que escribió el asesor")));
  }
});

test("un costo en cero o vacío no cuenta: sigue bloqueado", () => {
  for (const costo of [0, "", -5, "abc"]) {
    assert.equal(itemLibre([{ codigo: "KVE001", cantidad: 1, costo }]).hayErrores, true, String(costo));
  }
});

test("el costo manual se ignora en un producto sin la marca", () => {
  const r = itemLibre([{ codigo: "BES0302", cantidad: 1, costo: 1 }]);
  assert.equal(r.items[0].precioUnitario, getPrecio("BES0302", "PA"));
  assert.equal(r.items[0].precioACotizar, undefined);
});

test("personalización: agregar KVE001 y cambiar el vidrio por uno sobre pedido, con su costo", () => {
  const r = itemLibre([{ codigo: "CL6MM03SP", cantidad: 4 }], {
    personalizacion: {
      extras: [{ codigo: "KVE001", cantidad: 1, costo: 80000 }],
      cambios: [{ de: "CL6MM03SP", a: "CL4MM03LM", costo: 50000 }],
    },
  });
  assert.equal(r.hayErrores, false);
  const kit = r.items.find((l) => l.codigo === "KVE001")!;
  assert.equal(kit.precioUnitario, round2(80000 * getMultiplicador("ACCESORIO")!.pa));
  const vidrio = r.items.find((l) => l.codigo === "CL4MM03LM")!;
  assert.equal(vidrio.precioUnitario, round2(50000 * getMultiplicador("VIDRIO")!.pa));
  assert.equal(vidrio.cantidad, 4);

  // El mismo cambio sin costo bloquea.
  const sinCosto = itemLibre([{ codigo: "CL6MM03SP", cantidad: 4 }], {
    personalizacion: { cambios: [{ de: "CL6MM03SP", a: "CL4MM03LM" }] },
  });
  assert.equal(sinCosto.hayErrores, true);
});

test("los 4 kits que estaban en $0 tienen costo Templex y precio por segmento", () => {
  const m = getMultiplicador("ACCESORIO")!;
  for (const [codigo, costo] of [["KDE0303", 200000], ["KDE0304", 175000], ["SDR0301", 130000], ["CM572A", 120000]] as const) {
    const p = getProducto(codigo)!;
    assert.equal(p.costo_unitario, costo, codigo);
    assert.equal(getPrecio(codigo, "PA"), round2(costo * m.pa), codigo);
    assert.equal(getPrecio(codigo, "PB"), round2(costo * m.pb), codigo);
  }
});

test("las perforaciones se cobran por unidad", () => {
  for (const codigo of ["PERF01", "PERF02", "PERF03"]) assert.equal(getProducto(codigo)?.unidad, "UND", codigo);
});
