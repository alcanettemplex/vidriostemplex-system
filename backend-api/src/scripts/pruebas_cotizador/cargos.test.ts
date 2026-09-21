// Pruebas de los CARGOS DE OBRA de una propuesta (`cotizador/lib/cargos.ts`) y
// de la cadena de totales que los combina con los productos. Mismo patrón que
// `humo.test.ts` y `accesorios.test.ts`: `node:test` (integrado en Node desde
// la v18, sin runner que instalar) y precarga de la caché antes de la primera
// aserción.
//
// TODO LO QUE SE PRUEBA AQUÍ ES EN MEMORIA. No se escribe ni se lee
// `cotizador.propuesta` ni `cotizador.propuesta_cargo`: la única razón por la
// que esta suite toca Postgres es la precarga de la caché de precios y
// parámetros, exactamente igual que las otras cuatro. Lo que se valida son los
// motores de cálculo, que es donde vive la regla de negocio.
//
// POR QUÉ EXISTE ESTA SUITE (2026-09-20)
// El bug que originó todo el trabajo: la mano de obra (SMO) y el flete
// (GTFA26) se inyectaban como dos líneas más del BOM de cada ítem, y
// `totalizar()` multiplica TODA línea del BOM por `cantidadPiezas`. Medido en
// vivo, una ventana OX 5020 de 1000x1500 con 5 piezas cobraba 5 fletes
// ($200.000) y 5 manos de obra ($450.000). Un flete se paga una vez, no una
// por pieza. La prueba 1 es el centinela de esa regresión: si alguien vuelve a
// meter un `items.push()` de SMO o de flete dentro de un módulo de producto,
// esto se pone en rojo antes de que salga una cotización inflada al cliente.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";

import {
  sugerirSMO,
  sugerirCargosIniciales,
  calcularTotalesPropuesta,
  totalDeCargo,
  tiposObra,
  tipoObraPredominante,
} from "../../cotizador/lib/cargos";
import type { ItemParaCargos, CargoParaTotales } from "../../cotizador/lib/cargos";
import { getParametros } from "../../cotizador/lib/catalogo";
import { round2 } from "../../cotizador/lib/motorCalculo";
import type { LineaBOM } from "../../cotizador/lib/motorCalculo";
import { listarModulos, getModulo } from "../../cotizador/modules/registry";
import { calcular as calcularVentanas } from "../../cotizador/modules/ventanas";
import type { InputModulo } from "../../cotizador/tipos";

// Los motores leen el catálogo, los diseños y los parámetros de la caché en
// memoria, que se alimenta de Postgres: hay que precargarla antes de la primera
// aserción.
before(async () => {
  await cache.precargar();
});
after(async () => {
  await sequelize.close();
});

// ---------------------------------------------------------------------------
// Utilidades de la suite
// ---------------------------------------------------------------------------

/** ¿Es esta línea de BOM una mano de obra o un flete?
 *
 * Se busca por prefijo `SMO` y no por igualdad porque el Excel matriz tiene
 * cuatro códigos de mano de obra (SMO01 Cabinas, SMO02 Fachadas, SMO03 armada
 * de ventanas, SMO04 Persiana) y los módulos usaban tanto `SMO` a secas como
 * los numerados. Cualquiera de ellos dentro del BOM de un ítem es el bug. */
function esCargoDisfrazadoDeLinea(l: LineaBOM): boolean {
  const codigo = String(l.codigo ?? "").toUpperCase();
  return codigo.startsWith("SMO") || codigo === "GTFA26";
}

/** Vista tipada del resultado de un `calcular()`.
 *
 * El tipo de retorno de los módulos es una UNIÓN: el camino por diseño y el de
 * medidas libres devuelven formas distintas, y una de las ramas ni siquiera
 * trae `subtotalPieza`. En vez de castear a ciegas —que es justo lo que
 * escondería un cambio de contrato— se valida en tiempo de ejecución lo que la
 * prueba va a leer, y se falla con un mensaje legible si no está. */
function totalesDe(r: unknown, quien: string): { items: LineaBOM[]; subtotalPieza: number; subtotal: number } {
  const t = r as { items?: unknown; subtotalPieza?: unknown; subtotal?: unknown };
  assert.ok(Array.isArray(t.items), `"${quien}" debería devolver un array de líneas de BOM`);
  assert.equal(typeof t.subtotalPieza, "number", `"${quien}" debería devolver subtotalPieza numérico`);
  assert.equal(typeof t.subtotal, "number", `"${quien}" debería devolver subtotal numérico`);
  return {
    items: t.items as LineaBOM[],
    subtotalPieza: t.subtotalPieza as number,
    subtotal: t.subtotal as number,
  };
}

/** Un ítem de propuesta sintético: de todo el blob `resultado` a la cadena de
 * totales sólo le importan tres números, así que se fabrican a mano en vez de
 * cotizar de verdad. Las pruebas de totales quedan así con aritmética exacta y
 * legible, independiente de los precios del catálogo (que cambian). */
function producto(subtotalConAiu: number, resto: Record<string, number> = {}): ItemParaCargos {
  return { resultado: { subtotalConAiu, ...resto } };
}

/** Inputs válidos mínimos para los 6 módulos, todos con 5 piezas iguales: la
 * cantidad es lo que multiplicaba los fletes. Las medidas son las mismas que
 * usan las otras suites (150x120 en ventanería) o medidas de cabina realistas. */
const CASOS_POR_MODULO: Array<{ id: string; input: InputModulo }> = [
  {
    id: "ventanas",
    input: {
      disenoId: "Sistema5020::OX",
      anchoCm: 150,
      altoCm: 120,
      colorPerfileria: "mate",
      codigoVidrio: "CL4MM01CR",
      segmentoCliente: "PA",
      cantidadPiezas: 5,
    },
  },
  {
    id: "proyectantes",
    input: {
      segmentoCliente: "PA",
      numeroNaves: 2,
      anchoNaveCm: 60,
      altoNaveCm: 50,
      colorPerfileria: "mate",
      codigoVidrio: "CL4MM01CR",
      cantidadPiezas: 5,
    },
  },
  {
    id: "cabinas-corredizas",
    input: {
      anchoCm: 150,
      altoCm: 190,
      espesorVidrioMm: 8,
      tipoSistema: "corrediza",
      segmentoCliente: "PA",
      cantidadPiezas: 5,
    },
  },
  {
    id: "cabinas-batientes",
    input: {
      anchoCm: 120,
      altoCm: 190,
      espesorVidrioMm: 8,
      segmentoCliente: "PA",
      cantidadPiezas: 5,
    },
  },
  {
    id: "tablero",
    input: { anchoCm: 100, altoCm: 200, espesorMm: 8, segmentoCliente: "PA", cantidadPiezas: 5 },
  },
  {
    id: "espejo",
    input: { anchoCm: 100, altoCm: 80, acabado: "BPB", segmentoCliente: "PA", cantidadPiezas: 5 },
  },
];

// ---------------------------------------------------------------------------
// 1. La regresión que originó todo: cinco piezas no cobran cinco fletes
// ---------------------------------------------------------------------------

test("cinco piezas NO cobran cinco fletes ni cinco manos de obra: el BOM del ítem ya no trae SMO ni GTFA26", () => {
  const cinco = totalesDe(
    calcularVentanas({
      disenoId: "Sistema5020::OX",
      anchoCm: 150,
      altoCm: 120,
      colorPerfileria: "mate",
      codigoVidrio: "CL4MM01CR",
      segmentoCliente: "PA",
      cantidadPiezas: 5,
    }),
    "ventanas x5"
  );

  const intrusas = cinco.items.filter(esCargoDisfrazadoDeLinea);
  assert.deepEqual(
    intrusas.map((l) => l.codigo),
    [],
    "el BOM de un ítem no puede traer líneas de mano de obra ni de flete: `totalizar()` las multiplica " +
      "por cantidadPiezas y esa es exactamente la sobrefacturación que se corrigió el 2026-09-20. " +
      "SMO y flete son cargos de la PROPUESTA (cotizador.propuesta_cargo): se cobran una sola vez."
  );

  // La otra cara de la misma moneda: mientras SMO y flete vivieron dentro del
  // BOM, `subtotal` cargaba cinco veces un flete que se paga una. Con el BOM
  // limpio, el subtotal de 5 piezas es EXACTAMENTE cinco veces el de una: el
  // ítem quedó siendo sólo producto fabricado, que sí escala con la cantidad.
  const una = totalesDe(
    calcularVentanas({
      disenoId: "Sistema5020::OX",
      anchoCm: 150,
      altoCm: 120,
      colorPerfileria: "mate",
      codigoVidrio: "CL4MM01CR",
      segmentoCliente: "PA",
      cantidadPiezas: 1,
    }),
    "ventanas x1"
  );
  assert.equal(
    cinco.subtotalPieza,
    una.subtotalPieza,
    "el subtotal por pieza no puede depender de cuántas piezas se pidan"
  );
  assert.equal(
    cinco.subtotal,
    round2(una.subtotalPieza * 5),
    "con el BOM limpio, 5 piezas valen exactamente 5 veces una pieza"
  );
  assert.ok(cinco.subtotalPieza > 0, `el subtotal por pieza debería ser positivo, dio ${cinco.subtotalPieza}`);
});

test("ninguno de los 6 módulos deja ya líneas SMO ni GTFA26 en el BOM (barrido de los seis)", () => {
  assert.equal(CASOS_POR_MODULO.length, 6, "el barrido debe cubrir los seis módulos de producto");

  for (const caso of CASOS_POR_MODULO) {
    const modulo = getModulo(caso.id);
    assert.ok(modulo, `el módulo "${caso.id}" debería estar en el registry`);

    const r = totalesDe(modulo.calcular(caso.input), caso.id);
    const intrusas = r.items.filter(esCargoDisfrazadoDeLinea).map((l) => l.codigo);
    assert.deepEqual(
      intrusas,
      [],
      `el módulo "${caso.id}" volvió a inyectar mano de obra o flete en el BOM del ítem: ${intrusas.join(", ")}`
    );
    assert.ok(r.items.length > 0, `el módulo "${caso.id}" debería producir al menos una línea de BOM`);
  }
});

// ---------------------------------------------------------------------------
// 2. Un solo descuento, y vive en la propuesta
// ---------------------------------------------------------------------------

// Decisión cerrada del 2026-09-20: había dos descuentos (el de la cabecera de
// la cotización, que no afectaba a ningún total, y el del formulario por ítem,
// que sí). Ahora hay uno solo y está en la propuesta. `calcular()` sigue
// aceptando el parámetro por compatibilidad con lo ya guardado, pero el
// formulario —que es data-driven y se arma desde `meta.campos`— deja de
// pedirlo. Si alguien lo vuelve a declarar, reaparecen los dos descuentos y el
// vendedor puede aplicarlos ambos sin darse cuenta.
test("ningún módulo declara ya `descuentoPct` en su meta.campos (el descuento es de la propuesta)", () => {
  const modulos = listarModulos();
  assert.equal(modulos.length, 6, "deberían seguir siendo 6 módulos de producto");

  const culpables: string[] = [];
  for (const m of modulos) {
    const campos = (m as { campos?: Array<{ nombre?: string }> }).campos ?? [];
    assert.ok(campos.length > 0, `el módulo "${m.id}" debería declarar campos de formulario`);
    if (campos.some((c) => c?.nombre === "descuentoPct")) culpables.push(m.id);
  }

  assert.deepEqual(
    culpables,
    [],
    "estos módulos volvieron a pedir descuento en el formulario del ítem, y con eso vuelven a existir dos descuentos"
  );
});

// ---------------------------------------------------------------------------
// 3. El descuento toca los productos, nunca los cargos
// ---------------------------------------------------------------------------

test("el descuento de la propuesta se aplica sólo sobre los productos y NO toca los cargos", () => {
  const items = [producto(600000), producto(400000)]; // 1.000.000 en productos
  const cargos: CargoParaTotales[] = [
    { tipo: "SMO", cantidad: 1, valor_unitario: 450000 },
    { tipo: "FLETE", cantidad: 1, valor_unitario: 40000 },
  ];

  const sinDescuento = calcularTotalesPropuesta({ items, cargos, descuentoPct: 0, ivaPct: 0.19 });
  const conDescuento = calcularTotalesPropuesta({ items, cargos, descuentoPct: 0.1, ivaPct: 0.19 });

  // La aritmética completa del contrato numérico (sección 5 del diseño).
  assert.equal(conDescuento.totalProductos, 1000000, "totalProductos es el precio de lista, SIN descuento");
  assert.equal(conDescuento.totalDescuento, 100000);
  assert.equal(conDescuento.baseGravable, 900000);
  assert.equal(conDescuento.ivaProductos, 171000, "19% sobre la base ya descontada");
  assert.equal(conDescuento.totalCargos, 490000);
  assert.equal(conDescuento.ivaCargos, round2(450000 * 0.19) + round2(40000 * 0.19));
  assert.equal(conDescuento.totalIva, 264100);
  assert.equal(conDescuento.totalTotal, 900000 + 171000 + 490000 + 93100);

  // El corazón de la prueba: el 10% movió productos e IVA de productos, y dejó
  // los cargos intactos. Un descuento es una concesión sobre el producto
  // fabricado, no sobre el andamio alquilado ni sobre el flete que se le paga a
  // un tercero.
  assert.equal(conDescuento.totalCargos, sinDescuento.totalCargos, "el descuento no puede rebajar los cargos");
  assert.equal(conDescuento.ivaCargos, sinDescuento.ivaCargos, "el descuento no puede rebajar el IVA de los cargos");
  assert.equal(
    conDescuento.totalTotal,
    round2(sinDescuento.totalTotal - 100000 - round2(100000 * 0.19)),
    "el total sólo debe bajar el descuento y su IVA, ni un peso más"
  );
});

test("los cargos quedan fuera del AIU: el motor los suma tal cual, sin dividirlos por 0,96", () => {
  // `subtotalConAiu` ya viene con el AIU aplicado desde `totalizar()`. Los
  // cargos entran a la cadena por su valor de cara al cliente y no vuelven a
  // pasar por ningún divisor: si alguien los metiera dentro del AIU, un flete
  // de $40.000 se facturaría en $41.666,67.
  const totales = calcularTotalesPropuesta({
    items: [producto(1000000)],
    cargos: [{ tipo: "FLETE", cantidad: 1, valor_unitario: 40000 }],
    ivaPct: 0.19,
  });
  assert.equal(totales.totalCargos, 40000);
});

// ---------------------------------------------------------------------------
// 4. IVA de cargos: por línea, y respetando aplica_iva = false
// ---------------------------------------------------------------------------

test("el IVA de los cargos se calcula por línea y respeta `aplica_iva: false`", () => {
  const cargos: CargoParaTotales[] = [
    // El caso real de `aplica_iva: false`: el proveedor de andamios factura sin
    // IVA. Su importe suma a la base de cargos pero no genera un peso de IVA.
    { tipo: "ANDAMIO", cantidad: 3, valor_unitario: 90000, aplica_iva: false },
    { tipo: "SMO", cantidad: 1, valor_unitario: 120000 },
    // camelCase: los cargos llegan del store en snake_case y del controlador en
    // camelCase, y el motor acepta las dos formas para que nadie tenga que
    // traducir antes de pedir un total.
    { tipo: "HUACAL", cantidad: 2, valorUnitario: 80000, aplicaIva: true },
  ];

  const t = calcularTotalesPropuesta({ items: [producto(0)], cargos, descuentoPct: 0, ivaPct: 0.19 });

  assert.equal(t.totalCargos, 270000 + 120000 + 160000, "el andamio sin IVA sí suma a la base de cargos");
  assert.equal(
    t.ivaCargos,
    round2(120000 * 0.19) + round2(160000 * 0.19),
    "el andamio exento no puede aportar IVA: 22.800 + 30.400 y nada más"
  );
  assert.equal(t.ivaCargos, 53200);
  assert.equal(t.totalTotal, 550000 + 53200, "sin productos, el total es la base de cargos más su IVA");
});

test("el IVA de cargos se redondea POR LÍNEA, no sobre la suma (para que la cotización impresa cuadre)", () => {
  // Dos líneas de $33.333,33. Por línea: round2(6.333,3327) = 6.333,33 cada
  // una, 12.666,66 en total. Sobre el agregado: round2(66.666,66 × 0,19) =
  // 12.666,67, un peso más. Ese peso es justo el que hace que el cliente sume
  // los renglones que tiene delante y le dé distinto del total impreso.
  const cargos: CargoParaTotales[] = [
    { tipo: "OTRO", cantidad: 1, valor_unitario: 33333.33 },
    { tipo: "OTRO", cantidad: 1, valor_unitario: 33333.33 },
  ];
  const t = calcularTotalesPropuesta({ items: [], cargos, ivaPct: 0.19 });

  assert.equal(t.totalCargos, 66666.66);
  assert.equal(t.ivaCargos, 12666.66, "suma de los IVA de cada renglón");
  assert.notEqual(t.ivaCargos, round2(66666.66 * 0.19), "no debe ser el IVA del agregado (12.666,67)");
});

test("`totalDeCargo` es cantidad × valor unitario redondeado a 2, y tolera campos ausentes", () => {
  assert.equal(totalDeCargo({ cantidad: 3, valor_unitario: 90000 }), 270000);
  assert.equal(totalDeCargo({ cantidad: 2.5, valorUnitario: 33333.333 }), 83333.33);
  // Cantidad ausente = 1: es el caso de los cargos GLOBAL (SMO, flete), que no
  // llevan unidades. Sin ese respaldo un cargo sin cantidad valdría $0.
  assert.equal(totalDeCargo({ valor_unitario: 40000 }), 40000);
  assert.equal(totalDeCargo({ cantidad: 1 }), 0);
});

test("si no se pasa `ivaPct`, el motor toma el vigente de parámetros (no un literal hardcodeado)", () => {
  const iva = Number(getParametros().iva);
  const t = calcularTotalesPropuesta({ items: [producto(1000000)], cargos: [] });
  assert.equal(t.ivaProductos, round2(1000000 * iva));
});

// ---------------------------------------------------------------------------
// 5. Propuesta legada: se comporta exactamente como antes del cambio
// ---------------------------------------------------------------------------

test("una propuesta legada (`legadoCargosEnItems: true`) suma los ítems e ignora descuento y cargos", () => {
  // Son las 4 cotizaciones anteriores al cambio (ids 4,5,6,7). Su SMO y su
  // flete están DENTRO del blob `resultado` de cada ítem, que es una foto
  // inmutable que no se reescribe nunca. Si además se les sumaran cargos, se
  // cobraría dos veces lo mismo; y si se les aplicara el descuento de la
  // propuesta, el total dejaría de coincidir con el papel que ya vio el
  // cliente. Por eso el flag las congela.
  const items = [
    producto(600000, { iva: 114000, total: 714000 }),
    producto(400000, { iva: 76000, total: 476000 }),
  ];
  const cargos: CargoParaTotales[] = [{ tipo: "SMO", cantidad: 1, valor_unitario: 450000 }];

  const t = calcularTotalesPropuesta({
    items,
    cargos,
    descuentoPct: 0.25,
    legadoCargosEnItems: true,
    ivaPct: 0.19,
  });

  assert.equal(t.totalProductos, 1000000);
  assert.equal(t.totalDescuento, 0, "el descuento de la propuesta no se aplica a una cotización ya emitida");
  assert.equal(t.baseGravable, 1000000);
  assert.equal(t.totalCargos, 0, "los cargos no se suman: ya están dentro del blob de cada ítem");
  assert.equal(t.ivaCargos, 0);
  assert.equal(t.ivaProductos, 114000 + 76000, "el IVA es el que traía cada ítem, no uno recalculado");
  assert.equal(t.totalIva, 190000);
  assert.equal(t.totalTotal, 714000 + 476000, "el total es la suma pura de los totales de los ítems");

  // Y la comprobación que de verdad importa: da lo mismo que daba la suma de
  // antes del cambio, que es literalmente `Σ item.total`.
  const comoAntes = round2(items.reduce((acc, it) => acc + Number(it.resultado?.total ?? 0), 0));
  assert.equal(t.totalTotal, comoAntes);
});

// ---------------------------------------------------------------------------
// 6. Sugerencia de mano de obra
// ---------------------------------------------------------------------------

test("`sugerirSMO` cobra POR UNIDAD, no por metro cuadrado", () => {
  const tarifa = Number(getParametros().smo.armadaVentanas);
  assert.equal(tarifa, 60000, "centinela: SMO03 'solo armada de ventanas' del Excel matriz");

  // REGLA CAMBIADA EL 2026-09-20 (decisión del usuario). Antes esto era
  // `max(area × tarifa, tarifa)` y era un error de cobro: las tarifas del Excel
  // matriz son por UNIDAD instalada. Una ventana de 7,5 m² sugería $450.000 de
  // mano de obra donde correspondían $60.000. Esta prueba es la que impide que
  // el área vuelva a colarse en el cálculo.
  const unaPieza = sugerirSMO({
    items: [{ moduloId: "ventanas", resultado: { areaM2: 7.5, cantidadPiezas: 1 } }],
    tipoObra: "armadaVentanas",
  });
  assert.equal(unaPieza.cantidad, 1);
  assert.equal(unaPieza.tarifa, tarifa);
  assert.equal(unaPieza.monto, tarifa, "7,5 m² en UNA pieza es una sola instalación");
  assert.match(unaPieza.explicacion, /1 unidad × /, "la explicación habla de unidades, no de m²");
  assert.doesNotMatch(unaPieza.explicacion, /m²/, "el área ya no interviene en la sugerencia");

  // Las unidades salen de las piezas de la propuesta, que es lo que se instala.
  const tresPiezas = sugerirSMO({
    items: [{ moduloId: "ventanas", resultado: { areaM2: 22.5, cantidadPiezas: 3 } }],
    tipoObra: "armadaVentanas",
  });
  assert.equal(tresPiezas.cantidad, 3);
  assert.equal(tresPiezas.monto, round2(3 * tarifa), "3 instalaciones, tres veces la tarifa");
  assert.match(tresPiezas.explicacion, /3 unidades × /);

  // Y suma las piezas de TODOS los ítems, no sólo del primero.
  const dosItems = sugerirSMO({
    items: [
      { moduloId: "ventanas", resultado: { cantidadPiezas: 2 } },
      { moduloId: "ventanas", resultado: { cantidadPiezas: 4 } },
    ],
    tipoObra: "armadaVentanas",
  });
  assert.equal(dosItems.cantidad, 6);

  // Un ítem sin el dato cuenta como una pieza: la lectura prudente.
  const sinDato = sugerirSMO({ items: [{ moduloId: "ventanas", resultado: {} }], tipoObra: "armadaVentanas" });
  assert.equal(sinDato.cantidad, 1);
});

test("`sugerirSMO` cobra el tablero grande a su propia tarifa por unidad", () => {
  const p = getParametros();
  const tarifaGrande = Number(p.smo.pisoTableroGrande);
  const tarifaFachadas = Number(p.smo.fachadas);
  assert.equal(tarifaGrande, 87000, "centinela: tarifa propia de Tablero, regla que el Excel matriz no modela");
  assert.ok(
    tarifaFachadas < tarifaGrande,
    "la prueba supone que la tarifa de fachadas queda por debajo; si dejó de ser así, revisar el caso"
  );

  // Un tablero de 1,80 m (> 1,51 m) se instala a $87.000 la unidad en vez de a
  // los $85.000 de fachadas: instalar el grande cuesta más. La regla vivía
  // dentro del `items.push()` de SMO del módulo y se habría perdido en silencio
  // al sacarla de allí; desde el 2026-09-20 es una TARIFA, no un piso del total.
  const grande = sugerirSMO({
    items: [{ moduloId: "tablero", input: { anchoCm: 180, altoCm: 100 }, resultado: { cantidadPiezas: 2 } }],
    tipoObra: "fachadas",
  });
  assert.equal(grande.tarifa, tarifaGrande);
  assert.equal(grande.monto, round2(2 * tarifaGrande), "dos tableros grandes, dos veces su tarifa");
  assert.match(grande.explicacion, /1,51 m/, "la explicación debe nombrar el umbral que subió la tarifa");

  // Por debajo del umbral manda la tarifa de fachadas.
  const chico = sugerirSMO({
    items: [{ moduloId: "tablero", input: { anchoCm: 120, altoCm: 100 }, resultado: { cantidadPiezas: 1 } }],
    tipoObra: "fachadas",
  });
  assert.equal(chico.tarifa, tarifaFachadas, "1,20 m no es 'pieza grande'");
  assert.equal(chico.monto, tarifaFachadas);
});

test("el tipo de obra `otro` no sugiere monto: es libre, y un número inventado se acepta sin pensarlo", () => {
  const s = sugerirSMO({ items: [{ moduloId: "ventanas", resultado: { areaM2: 10 } }], tipoObra: "otro" });
  assert.equal(s.monto, 0);
  assert.equal(s.explicacion, "");
  assert.equal(s.areaM2, 10, "el área se sigue informando aunque no haya sugerencia");

  // Lo mismo para un tipo de obra ausente o desconocido: no se adivina.
  assert.equal(sugerirSMO({ items: [], tipoObra: null }).monto, 0);
  assert.equal(sugerirSMO({ items: [], tipoObra: "loQueSea" }).monto, 0);
});

test("`tiposObra()` lee las tarifas de parámetros, nunca de una constante propia", () => {
  const p = getParametros();
  const lista = tiposObra();
  assert.equal(lista.length, 5, "las 4 tarifas del Excel matriz más la opción 'otro'");

  const porId = Object.fromEntries(lista.map((t) => [t.id, t.tarifa]));
  assert.equal(porId.cabinas, p.smo.cabinas);
  assert.equal(porId.fachadas, p.smo.fachadas);
  assert.equal(porId.armadaVentanas, p.smo.armadaVentanas);
  assert.equal(porId.persiana, p.smo.persiana);
  assert.equal(porId.otro, 0, "'otro' es monto libre: no tiene tarifa");
});

test("`tipoObraPredominante` elige por el módulo que más ítems aporta", () => {
  assert.equal(
    tipoObraPredominante([{ moduloId: "tablero" }, { moduloId: "tablero" }, { moduloId: "ventanas" }]),
    "fachadas"
  );
  assert.equal(tipoObraPredominante([{ moduloId: "cabinas-batientes" }]), "cabinas");
  // Sin ítems reconocibles se cae al tipo más común del negocio en vez de
  // fallar: la sugerencia es editable y bloquear al vendedor por esto sería peor.
  assert.equal(tipoObraPredominante([]), "armadaVentanas");
  assert.equal(tipoObraPredominante([{ moduloId: "inventado" }]), "armadaVentanas");
});

test("`sugerirCargosIniciales` propone SMO y flete; andamio y huacal arrancan AUSENTES, no en cero", () => {
  const cargos = sugerirCargosIniciales({
    items: [{ moduloId: "ventanas", resultado: { areaM2: 4 } }],
  });

  assert.deepEqual(
    cargos.map((c) => c.tipo),
    ["SMO", "FLETE"],
    "una línea de andamio en $0 en la cotización impresa le dice al cliente que el andamio es gratis, " +
      "cuando lo que pasa es que nadie lo ha cotizado (misma invariante 'AUSENTE ≠ CERO' de la calibración)"
  );

  const p = getParametros();
  const smo = cargos[0];
  assert.equal(smo.valorUnitario, Number(p.smo.armadaVentanas), "el valor unitario es la TARIFA, no el total");
  assert.equal(smo.unidad, "UND", "la mano de obra se cobra por unidad instalada");
  assert.equal(round2(smo.cantidad * smo.valorUnitario), round2(smo.cantidad * Number(p.smo.armadaVentanas)));
  assert.equal(smo.origen, "SUGERIDO", "si el vendedor lo edita pasa a MANUAL; recién creado es SUGERIDO");
  assert.equal(smo.tipoObra, "armadaVentanas");
  assert.ok(smo.explicacion, "la pantalla muestra la explicación bajo el campo");

  const flete = cargos[1];
  assert.equal(flete.valorUnitario, round2(Number(p.flete_fijo)), "el flete sale de parámetros, y es editable");
  assert.equal(flete.cantidad, 1, "un flete se paga UNA vez por propuesta: ese fue todo el bug");
  assert.equal(flete.unidad, "GLOBAL");
});

// ---------------------------------------------------------------------------
// 7. Defensa del descuento: es una fracción, no un porcentaje
// ---------------------------------------------------------------------------

test("un `descuentoPct` fuera de 0–1 lanza un error legible en vez de devolver un total negativo", () => {
  const items = [producto(1000000)];

  // Sin esta guarda, un 5 escrito donde iba 0,05 se aplica como 500%: el
  // descuento sería $5.000.000 sobre $1.000.000 y el total saldría NEGATIVO, en
  // HTTP 200 y sin una sola advertencia — se podía guardar y mandar al cliente
  // así. Es el mismo fallo que se corrigió en `totalizar()` el 2026-09-12; el
  // descuento de la propuesta NO pasa por `totalizar()`, así que necesita su
  // propia red (un script o una migración pueden llamar a esta función sin Zod
  // delante).
  assert.throws(
    () => calcularTotalesPropuesta({ items, descuentoPct: 5, ivaPct: 0.19 }),
    /entre 0% y 100%/,
    "un 5 (que el vendedor quiso como 5%) debe rechazarse, no aplicarse como 500%"
  );
  assert.throws(() => calcularTotalesPropuesta({ items, descuentoPct: -0.1, ivaPct: 0.19 }), /entre 0% y 100%/);

  // Los extremos SÍ son válidos: 0 es "sin descuento" y 1 es el regalo completo
  // (que existe: obra de garantía, reposición por no conformidad).
  assert.equal(calcularTotalesPropuesta({ items, descuentoPct: 0, ivaPct: 0.19 }).totalDescuento, 0);
  const regalado = calcularTotalesPropuesta({ items, descuentoPct: 1, ivaPct: 0.19 });
  assert.equal(regalado.baseGravable, 0);
  assert.equal(regalado.ivaProductos, 0);

  // Un descuento válido nunca puede producir un total negativo.
  const sano = calcularTotalesPropuesta({ items, descuentoPct: 0.5, ivaPct: 0.19 });
  assert.ok(sano.totalTotal > 0, `el total siempre debe ser positivo, dio ${sano.totalTotal}`);
});

test("la propuesta legada no valida el descuento porque ni siquiera lo mira", () => {
  // Documenta una asimetría deliberada: el camino legado devuelve antes de la
  // guarda. No es un agujero —ese descuento se ignora, no se aplica— pero
  // conviene dejarlo pinchado: si alguien mueve la validación arriba del
  // `if (legadoCargosEnItems)`, las 4 cotizaciones migradas con un
  // `descuento_pct` heredado raro empezarían a reventar al abrirlas.
  const t = calcularTotalesPropuesta({
    items: [producto(1000000, { iva: 190000, total: 1190000 })],
    descuentoPct: 5,
    legadoCargosEnItems: true,
  });
  assert.equal(t.totalTotal, 1190000);
  assert.equal(t.totalDescuento, 0);
});
