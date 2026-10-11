// Instalación como CARGO DE LA OBRA (2026-10-11, decisión del usuario).
//
// Los asesores reportaban que con varios productos la instalación "se calculaba
// por aparte": había una casilla por producto. Desde este cambio hay UNA casilla
// por propuesta, en el panel de Cargos de la obra, con un valor que el asesor
// puede corregir. Reglas que vigila esta suite:
//
//   1. Sin opción (propuesta anterior, `con_instalacion` NULL) todo sigue como
//      antes: manda la casilla de cada producto.
//   2. Con opción, la casilla de la propuesta se SELLA en todos los productos
//      que tienen "Con instalación"; un ítem libre no gana la casilla.
//   3. Las tarifas y el mínimo de 1 m² por producto no cambian (decisión del
//      usuario: "mantener mínimo por producto"); el ensamble tampoco.
//   4. El valor del asesor reemplaza las líneas automáticas de instalación por
//      UNA sola, y solo cuenta con la casilla marcada.
//   5. La frase del frontend ("Suministro e instalación de…") se sella igual.
//
// En memoria: Postgres solo para la precarga de la caché de parámetros.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import {
  calcularManoObraProductos,
  instalacionCalculada,
  manoObraPorItem,
  sellarInstalacion,
} from "../../cotizador/lib/cargos";
import type { ItemParaCargos } from "../../cotizador/lib/cargos";
import { round2 } from "../../cotizador/lib/motorCalculo";
import { sellarInstalacion as sellarEnPantalla } from "../../../../frontend-web/src/features/cotizador/instalacion";
import type { ResultadoCalculo } from "../../../../frontend-web/src/features/cotizador/types";

before(async () => {
  await cache.precargar();
});
after(async () => {
  await sequelize.close();
});

/** Una ventana 1,5 × 1,2 m con instalación, un espejo 0,5 × 0,5 m (cobra el
 * mínimo de 1 m²) SIN instalación y un ítem libre. */
const obra = (): ItemParaCargos[] => [
  { moduloId: "ventanas", input: { anchoCm: 150, altoCm: 120, cantidadPiezas: 1, conInstalacion: true } },
  { moduloId: "espejo", input: { anchoCm: 50, altoCm: 50, cantidadPiezas: 1, conInstalacion: false } },
  { moduloId: "item-libre", input: { lineas: [] } },
];

const instalacion = (lineas: ReturnType<typeof calcularManoObraProductos>) => lineas.filter((l) => l.tipo === "INSTALACION");
const ensamble = (lineas: ReturnType<typeof calcularManoObraProductos>) => lineas.filter((l) => l.tipo === "ENSAMBLE");

test("1. Sin opción (propuesta anterior): manda la casilla de cada producto", () => {
  const lineas = calcularManoObraProductos(obra());
  const desc = instalacion(lineas).map((l) => l.descripcion);
  assert.deepEqual(desc, ["Instalación ventanas y proyectantes"], "el espejo sin casilla no se instala");
});

test("2. Casilla marcada: se instalan TODOS los productos con la casilla, el ítem libre no", () => {
  const lineas = calcularManoObraProductos(obra(), { activa: true, valorManual: null });
  const desc = instalacion(lineas).map((l) => l.descripcion).sort();
  assert.deepEqual(desc, ["Instalación espejos y tableros", "Instalación ventanas y proyectantes"]);
  // Mínimo de 1 m² por producto: el espejo de 0,25 m² cobra 1 m².
  assert.equal(instalacion(lineas).find((l) => (l.descripcion ?? "").includes("espejos"))?.cantidad, 1);

  const sellados = sellarInstalacion(obra(), { activa: true });
  assert.equal(sellados[1].input?.conInstalacion, true);
  assert.ok(!("conInstalacion" in (sellados[2].input ?? {})), "el ítem libre no gana la casilla");
});

test("3. Casilla desmarcada: ninguna instalación, el ensamble se cobra igual", () => {
  const con = calcularManoObraProductos(obra(), { activa: true, valorManual: null });
  const sin = calcularManoObraProductos(obra(), { activa: false, valorManual: null });
  assert.equal(instalacion(sin).length, 0);
  assert.deepEqual(ensamble(sin), ensamble(con), "el ensamble no depende de la instalación");
});

test("4. Valor del asesor: una sola línea 'Instalación' con ese monto; el ensamble no cambia", () => {
  const auto = calcularManoObraProductos(obra(), { activa: true, valorManual: null });
  const manual = calcularManoObraProductos(obra(), { activa: true, valorManual: 300000 });
  const inst = instalacion(manual);
  assert.equal(inst.length, 1);
  assert.equal(inst[0].descripcion, "Instalación");
  assert.equal(round2(inst[0].cantidad * inst[0].valorUnitario), 300000);
  assert.match(inst[0].explicacion ?? "", /calculado/);
  assert.deepEqual(ensamble(manual), ensamble(auto));

  // Con la casilla desmarcada el valor escrito no cuenta.
  assert.equal(instalacion(calcularManoObraProductos(obra(), { activa: false, valorManual: 300000 })).length, 0);
  // Un valor en cero = sin instalación (no se imprime un renglón en $0).
  assert.equal(instalacion(calcularManoObraProductos(obra(), { activa: true, valorManual: 0 })).length, 0);
});

test("5. 'Calculado' = suma de las líneas automáticas de instalación", () => {
  const auto = calcularManoObraProductos(obra(), { activa: true, valorManual: null });
  const suma = round2(instalacion(auto).reduce((a, l) => a + round2(l.cantidad * l.valorUnitario), 0));
  assert.ok(suma > 0);
  assert.equal(instalacionCalculada(auto), suma);
});

test("6. Reparto del PDF: el peso de cada producto sigue la casilla de la propuesta", () => {
  const sin = manoObraPorItem(obra(), { activa: false });
  const con = manoObraPorItem(obra(), { activa: true });
  assert.ok(con[1] > 0 && sin[1] === 0, "el espejo pesa solo con instalación");
  assert.ok(con[0] > sin[0] && sin[0] > 0, "la ventana pesa su ensamble siempre y suma la instalación");
  assert.equal(con[2], 0, "el ítem libre no pesa");
});

test("7. Pantalla: el sello cambia la casilla y el verbo de la frase comercial", () => {
  const item = {
    input: { anchoCm: 100, conInstalacion: true } as Record<string, unknown>,
    resultado: { descripcionComercial: "Sala — Suministro e instalación de ventana 744 color mate" } as unknown as ResultadoCalculo,
  };
  const sin = sellarEnPantalla(item, false);
  assert.equal(sin.input.conInstalacion, false);
  assert.equal(sin.resultado.descripcionComercial, "Sala — Suministro de ventana 744 color mate");
  const con = sellarEnPantalla(sin, true);
  assert.equal(con.resultado.descripcionComercial, item.resultado.descripcionComercial);
  // Ítem libre (sin la clave): intacto.
  const libre = { input: { lineas: [] } as Record<string, unknown>, resultado: {} as ResultadoCalculo };
  assert.equal(sellarEnPantalla(libre, true), libre);
});
