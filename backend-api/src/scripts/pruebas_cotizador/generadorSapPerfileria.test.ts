// Pruebas del generador de perfilería para SAP (`cotizador/lib/generadorSapPerfileria.ts`).
//
// A diferencia de las otras cuatro suites de `test:cotizador`, ÉSTA NO precarga
// la caché ni abre conexión a Postgres: la función bajo prueba es pura (no lee
// catálogo, no lee diseños, sólo transforma el `resultado.cortes.perfiles[]`
// que ya viene calculado). Abrir una conexión de más aquí sería gastar una de
// las 15 del pooler en modo sesión sin necesitarla.
import { test } from "node:test";
import assert from "node:assert/strict";

import { generarPerfileriaSAP } from "../../cotizador/lib/generadorSapPerfileria";
import type { ItemParaPerfileriaSAP } from "../../cotizador/lib/generadorSapPerfileria";
import type { CortePerfil } from "../../cotizador/tipos";

/** Fabrica un corte de perfil con los campos que el generador necesita;
 * el resto de `CortePerfil` (margenMm, nivelCorte...) no le importa a la SAP. */
function corte(datos: Partial<CortePerfil> & { medidaMm: number; cantidad: number }): CortePerfil {
  return {
    ref: datos.ref ?? "REF",
    descripcion: datos.descripcion ?? "Perfil de prueba",
    codigo: datos.codigo ?? "COD001",
    desperdicioPct: datos.desperdicioPct ?? 5,
    ...datos,
  };
}

function item(cortes: CortePerfil[] | null, descripcion = "ítem"): ItemParaPerfileriaSAP {
  return { descripcion, resultado: cortes ? { cortes: { perfiles: cortes } } : {} };
}

test("una sola barra alcanza cuando el total con desperdicio no llega a 6 m", () => {
  // 1000 mm x 5 piezas = 5 m netos; con 5% de desperdicio = 5.25 m -> 1 barra.
  const { filas } = generarPerfileriaSAP([
    item([corte({ medidaMm: 1000, cantidad: 5 })]),
  ]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].cantidad, 1);
});

test("redondea hacia arriba en cuanto se pasa de un múltiplo de 6 m", () => {
  // 6000 mm x 1 pieza = 6 m netos; con 5% de desperdicio = 6.3 m -> 2 barras,
  // nunca 1: el retal es responsabilidad del taller, pero no se puede pedir
  // de menos.
  const { filas } = generarPerfileriaSAP([
    item([corte({ medidaMm: 6000, cantidad: 1 })]),
  ]);
  assert.equal(filas[0].cantidad, 2);
});

test("un total que cae EXACTO en un múltiplo de 6 m no pide una barra de más", () => {
  // 6000 mm x 1 pieza, sin desperdicio (0%) = exactamente 6 m -> 1 barra, no 2,
  // pese al margen de punto flotante que arrastra la división.
  const { filas } = generarPerfileriaSAP([
    item([corte({ medidaMm: 6000, cantidad: 1, desperdicioPct: 0 })]),
  ]);
  assert.equal(filas[0].cantidad, 1);
});

test("consolida cortes de la misma medida en una sola entrada de DIMENSION", () => {
  const { filas } = generarPerfileriaSAP([
    item([
      corte({ medidaMm: 400, cantidad: 2 }),
      corte({ medidaMm: 400, cantidad: 2 }),
      corte({ medidaMm: 1000, cantidad: 1 }),
    ]),
  ]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].dimension, "4-400/ 1-1000");
});

test("consolida el mismo código entre ítems distintos en una sola fila", () => {
  const { filas } = generarPerfileriaSAP([
    item([corte({ codigo: "SIL0102", medidaMm: 483, cantidad: 2 })], "ventana 1"),
    item([corte({ codigo: "SIL0102", medidaMm: 900, cantidad: 1 })], "ventana 2"),
  ]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].codigo, "SIL0102");
  assert.equal(filas[0].dimension, "2-483/ 1-900");
});

test("asigna las letras por orden de primera aparición entre ítems, no alfabético por código", () => {
  const { filas } = generarPerfileriaSAP([
    item([corte({ codigo: "ZZZ999", medidaMm: 500, cantidad: 1 })], "primero"),
    item([corte({ codigo: "AAA001", medidaMm: 500, cantidad: 1 })], "segundo"),
  ]);
  assert.deepEqual(
    filas.map((f) => [f.item, f.codigo]),
    [
      ["A", "ZZZ999"],
      ["B", "AAA001"],
    ]
  );
});

test("un ítem sin despiece (espejo, tablero) no genera fila ni advertencia", () => {
  const { filas, advertencias } = generarPerfileriaSAP([item(null, "espejo sin marco")]);
  assert.equal(filas.length, 0);
  assert.equal(advertencias.length, 0);
});

test("un corte sin código de catálogo se excluye y queda explicado en advertencias", () => {
  const { filas, advertencias } = generarPerfileriaSAP([
    item([corte({ codigo: null, medidaMm: 500, cantidad: 1, descripcion: "Jamba sin precio" })], "ventana rara"),
  ]);
  assert.equal(filas.length, 0);
  assert.equal(advertencias.length, 1);
  assert.match(advertencias[0], /ventana rara/);
  assert.match(advertencias[0], /Jamba sin precio/);
});

test("un corte de un blob anterior al cambio (sin desperdicioPct) se excluye y se explica", () => {
  const corteViejo = corte({ medidaMm: 500, cantidad: 1 });
  delete (corteViejo as Partial<CortePerfil>).desperdicioPct;
  const { filas, advertencias } = generarPerfileriaSAP([item([corteViejo], "cotización vieja")]);
  assert.equal(filas.length, 0);
  assert.equal(advertencias.length, 1);
  assert.match(advertencias[0], /cotización vieja/);
  assert.match(advertencias[0], /clona la propuesta/i);
});

test("una fila apta y una excluida en el mismo ítem no se bloquean entre sí", () => {
  const { filas, advertencias } = generarPerfileriaSAP([
    item([
      corte({ codigo: "SIL0102", medidaMm: 483, cantidad: 2 }),
      corte({ codigo: null, medidaMm: 200, cantidad: 1 }),
    ]),
  ]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].codigo, "SIL0102");
  assert.equal(advertencias.length, 1);
});
