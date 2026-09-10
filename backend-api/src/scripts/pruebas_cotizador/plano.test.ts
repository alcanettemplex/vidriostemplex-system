// Prueba de planoProducto.ts: construcciones sintéticas para cada regla del
// algoritmo de asignación paño↔panel, y una corrida completa sobre los 138
// diseños reales del catálogo a 3 medidas de fabricación (900×800, 1500×1200
// y 2400×1800 mm), evaluando sus fórmulas reales de `vidrios[]` con la misma
// cuenta que usa motorDespiece (`a*anchoMm + b*altoMm + c`, redondeada a
// 2 decimales) para que el `vidrios` que se le pasa a `calcularPlano` sea
// exactamente el que produciría una cotización real a esa medida.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calcularPlano } from "../../cotizador/lib/planoProducto";

const disenos = JSON.parse(
  readFileSync(path.join(__dirname, "..", "datos_cotizador", "disenos.json"), "utf-8")
).disenos;

/** Misma fórmula que el `evaluar()` privado de motorDespiece — reevaluada
 * aquí sólo para construir datos de prueba realistas, no para probar
 * planoProducto.ts con datos artificiales que nunca saldrían del sistema. */
function evaluar(formula: {a:number;b:number;c:number}|null|undefined, anchoMm: number, altoMm: number): number|null {
  if (!formula) return null;
  return formula.a * anchoMm + formula.b * altoMm + formula.c;
}

/** Construye el array `vidrios` tal como lo dejaría motorDespiece en
 * `resultado.cortes.vidrios` para un diseño real a una medida de fabricación
 * dada (mismo redondeo a 2 decimales, mismo descarte de paños ≤0). */
function vidriosReales(diseno: any, anchoMm: number, altoMm: number) {
  const vidrios: Array<{anchoMm:number;altoMm:number;cantidad:number}> = [];
  for (const v of diseno.vidrios) {
    const a = evaluar(v.formulaAncho, anchoMm, altoMm);
    const h = evaluar(v.formulaAlto, anchoMm, altoMm);
    if (a === null || h === null || !Number.isFinite(a) || !Number.isFinite(h)) continue;
    if (a <= 0 || h <= 0) continue;
    vidrios.push({ anchoMm: Math.round(a * 100) / 100, altoMm: Math.round(h * 100) / 100, cantidad: v.cantidad });
  }
  return vidrios;
}

const TAMANOS_MM = [
  { anchoFabMm: 900, altoFabMm: 800 },
  { anchoFabMm: 1500, altoFabMm: 1200 },
  { anchoFabMm: 2400, altoFabMm: 1800 },
];

function sumaAnchoPorFila(paneles: Array<{fila:number;anchoMm:number}>) {
  const filas = new Map<number, number>();
  for (const p of paneles) {
    if (!filas.has(p.fila)) filas.set(p.fila, 0);
    filas.set(p.fila, (filas.get(p.fila) ?? 0) + p.anchoMm);
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Construcciones sintéticas — una por cada paso del algoritmo
// ---------------------------------------------------------------------------

test("sintético: código no reconocible -> esquema inmediato, confianza nula", () => {
  const p = calcularPlano({
    codigoDiseno: "???",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [],
  });
  assert.equal(p.escala, "esquema");
  assert.equal(p.confianza, "nula");
  assert.ok(p.motivo);
  assert.deepEqual(p.paneles, []);
});

test("sintético: medida exterior inválida -> esquema, sin excepción", () => {
  for (const mala of [0, -100, NaN, undefined]) {
    const p = calcularPlano({ codigoDiseno: "OX", modulo: "ventanas", anchoFabMm: mala, altoFabMm: 1200, vidrios: [] });
    assert.equal(p.escala, "esquema");
    assert.equal(p.confianza, "nula");
  }
});

test("sintético: clase única (paso 4) -> escala real, confianza alta, sin residuo perdido", () => {
  // OO: dos paneles fijos idénticos de 700x1160 sobre un exterior de 1500x1200.
  const p = calcularPlano({
    codigoDiseno: "OO",
    modulo: "proyectantes",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [{ anchoMm: 700, altoMm: 1160, cantidad: 2 }],
  });
  assert.equal(p.escala, "real");
  assert.equal(p.confianza, "alta");
  assert.equal(p.paneles.length, 2);
  for (const panel of p.paneles) {
    assert.ok(panel.anchoDerivado);
    assert.deepEqual(panel.pano, { anchoMm: 700, altoMm: 1160 });
  }
  const sumaAncho = p.paneles.reduce((a, x) => a + x.anchoMm, 0);
  assert.ok(Math.abs(sumaAncho - 1500) < 0.01, `suma ancho ${sumaAncho} debería ser ~1500`);
  // Cota exterior + UNA sola cota de paño (los dos miden igual).
  assert.equal(p.cotas.filter((c) => c.tipo === "pano").length, 1);
  assert.equal(p.cotas.filter((c) => c.tipo === "exterior-ancho").length, 1);
  assert.equal(p.cotas.filter((c) => c.tipo === "exterior-alto").length, 1);
});

test("sintético: multiset de conteos por tipo (paso 5) -> escala real, confianza alta", () => {
  // XOX con 2 paños de 466x1103 (los X) y 1 paño de 476x1103 (el O).
  const p = calcularPlano({
    codigoDiseno: "XOX",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [
      { anchoMm: 466, altoMm: 1103, cantidad: 2 },
      { anchoMm: 476, altoMm: 1103, cantidad: 1 },
    ],
  });
  assert.equal(p.escala, "real");
  assert.equal(p.confianza, "alta");
  const porTipo = Object.fromEntries(p.paneles.map((x) => [`${x.fila}-${x.col}`, x]));
  const tipoX = p.paneles.filter((x) => x.tipo === "X");
  const tipoO = p.paneles.filter((x) => x.tipo === "O");
  assert.equal(tipoX.length, 2);
  assert.equal(tipoO.length, 1);
  for (const x of tipoX) assert.deepEqual(x.pano, { anchoMm: 466, altoMm: 1103 });
  assert.deepEqual(tipoO[0].pano, { anchoMm: 476, altoMm: 1103 });
});

test("sintético: número de paños != número de paneles (paso 3) -> esquema, no se inventa", () => {
  const p = calcularPlano({
    codigoDiseno: "XOX",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [{ anchoMm: 500, altoMm: 1100, cantidad: 2 }], // XOX pide 3 paneles, aquí sólo hay 2
  });
  assert.equal(p.escala, "esquema");
  assert.match(String(p.motivo), /no coinciden/);
});

test("sintético: spread de anchos <3% entre clases candidatas (paso 6) -> real, confianza media", () => {
  // 3 clases de ancho muy parecido (diferencia <3%) para 2 tipos (O:1,X:2):
  // no coincide el multiset (3 clases vs 2 tipos), pero están todas dentro
  // del margen de redondeo -> se asigna en orden de aparición.
  const p = calcularPlano({
    codigoDiseno: "OXX",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [
      { anchoMm: 500, altoMm: 1100, cantidad: 1 },
      { anchoMm: 505, altoMm: 1100, cantidad: 1 },
      { anchoMm: 495, altoMm: 1100, cantidad: 1 },
    ],
  });
  assert.equal(p.escala, "real");
  assert.equal(p.confianza, "media");
  assert.equal(p.avisos.length, 1);
});

test("sintético: sin clase única, sin multiset, sin spread y sin override -> esquema con motivo de ambigüedad", () => {
  const p = calcularPlano({
    codigoDiseno: "OXX",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [
      { anchoMm: 300, altoMm: 1100, cantidad: 1 },
      { anchoMm: 900, altoMm: 1100, cantidad: 1 },
      { anchoMm: 300, altoMm: 400, cantidad: 1 },
    ],
  });
  assert.equal(p.escala, "esquema");
  assert.equal(p.confianza, "nula");
  assert.match(String(p.motivo), /ambig|no coinciden|tamaño/i);
});

test("sintético: override manual (paso 7) resuelve un caso que sin él sería esquema", () => {
  const args = {
    codigoDiseno: "OXX",
    modulo: "ventanas",
    anchoFabMm: 1500,
    altoFabMm: 1200,
    vidrios: [
      { anchoMm: 300, altoMm: 1100, cantidad: 1 },
      { anchoMm: 900, altoMm: 1100, cantidad: 1 },
      { anchoMm: 300, altoMm: 400, cantidad: 1 },
    ],
  };
  const sinOverride = calcularPlano(args);
  assert.equal(sinOverride.escala, "esquema");

  const conOverride = calcularPlano({
    ...args,
    disenoId: "SistemaTest::OXX",
    overrides: {
      "SistemaTest::OXX": {
        orden: [
          { anchoMm: 300, altoMm: 1100 },
          { anchoMm: 900, altoMm: 1100 },
          { anchoMm: 300, altoMm: 400 },
        ],
      },
    },
  });
  assert.equal(conOverride.escala, "real");
  assert.equal(conOverride.confianza, "media");
});

test("sintético: multi-fila (2 filas de 1 panel, como O_O) reparte el alto exterior proporcionalmente", () => {
  const p = calcularPlano({
    codigoDiseno: "O_O",
    modulo: "proyectantes",
    anchoFabMm: 1200,
    altoFabMm: 1200,
    // Igual proporción que el diseño real Sistema3831::O_O: mismo alto en
    // ambos paños -> las dos filas deberían repartirse el alto por igual.
    vidrios: [{ anchoMm: 1160, altoMm: 566, cantidad: 2 }],
  });
  assert.equal(p.escala, "real");
  assert.equal(p.paneles.length, 2);
  assert.equal(p.paneles[0].fila, 0);
  assert.equal(p.paneles[1].fila, 1);
  assert.ok(Math.abs(p.paneles[0].altoMm - p.paneles[1].altoMm) < 0.01, "las dos filas deberían repartirse el alto por igual");
  const sumaAlto = p.paneles[0].altoMm + p.paneles[1].altoMm;
  assert.ok(Math.abs(sumaAlto - 1200) < 0.01);
});

test("sintético: espejo ESP_* es un panel único a toda el área", () => {
  const p = calcularPlano({
    codigoDiseno: "ESP_FLOT_1",
    modulo: "espejo",
    anchoFabMm: 800,
    altoFabMm: 600,
    vidrios: [{ anchoMm: 800, altoMm: 600, cantidad: 1 }],
  });
  assert.equal(p.escala, "real");
  assert.equal(p.paneles.length, 1);
  assert.equal(p.paneles[0].tipo, "E");
  assert.ok(Math.abs(p.paneles[0].anchoMm - 800) < 0.01);
  assert.ok(Math.abs(p.paneles[0].altoMm - 600) < 0.01);
});

test("sintético: calcularPlano nunca lanza excepción con entradas basura", () => {
  const entradas = [
    {},
    { codigoDiseno: "OX" },
    { codigoDiseno: null, anchoFabMm: 1000, altoFabMm: 1000, vidrios: null },
    { codigoDiseno: "OX", anchoFabMm: 1000, altoFabMm: 1000, vidrios: "no es un array" },
    { codigoDiseno: "OX", anchoFabMm: 1000, altoFabMm: 1000, vidrios: [{ anchoMm: "x", altoMm: null, cantidad: -1 }] },
    { codigoDiseno: "OX", anchoFabMm: -1, altoFabMm: -1, vidrios: [] },
    undefined,
  ];
  for (const e of entradas) {
    assert.doesNotThrow(() => calcularPlano(e as never));
  }
});

// ---------------------------------------------------------------------------
// Los 138 diseños reales, a 3 medidas de fabricación (900x800, 1500x1200,
// 2400x1800 mm), evaluando sus fórmulas reales de vidrios[].
// ---------------------------------------------------------------------------

test("los 138 diseños reales: calcularPlano nunca lanza excepción, en ninguna de las 3 medidas", () => {
  for (const d of disenos) {
    for (const t of TAMANOS_MM) {
      assert.doesNotThrow(() => {
        calcularPlano({
          codigoDiseno: d.diseno,
          modulo: d.modulo,
          anchoFabMm: t.anchoFabMm,
          altoFabMm: t.altoFabMm,
          vidrios: vidriosReales(d, t.anchoFabMm, t.altoFabMm),
        });
      }, `${d.id} @ ${t.anchoFabMm}x${t.altoFabMm} lanzó excepción`);
    }
  }
});

test("los 138 diseños reales: ningún panel tiene ancho o alto <= 0, en ninguna de las 3 medidas", () => {
  const ofensores = [];
  for (const d of disenos) {
    for (const t of TAMANOS_MM) {
      const p = calcularPlano({
        codigoDiseno: d.diseno,
        modulo: d.modulo,
        anchoFabMm: t.anchoFabMm,
        altoFabMm: t.altoFabMm,
        vidrios: vidriosReales(d, t.anchoFabMm, t.altoFabMm),
      });
      for (const panel of p.paneles) {
        if (!(panel.anchoMm > 0) || !(panel.altoMm > 0)) {
          ofensores.push(`${d.id} @ ${t.anchoFabMm}x${t.altoFabMm}: panel ${JSON.stringify(panel)}`);
        }
      }
    }
  }
  assert.deepEqual(ofensores, [], `${ofensores.length} panel(es) con medida <= 0:\n${ofensores.join("\n")}`);
});

test("los 138 diseños reales, escala 'real': cada fila suma el ancho exterior (±0.01mm) y las filas suman el alto exterior (±0.01mm)", () => {
  const ofensores = [];
  for (const d of disenos) {
    for (const t of TAMANOS_MM) {
      const p = calcularPlano({
        codigoDiseno: d.diseno,
        modulo: d.modulo,
        anchoFabMm: t.anchoFabMm,
        altoFabMm: t.altoFabMm,
        vidrios: vidriosReales(d, t.anchoFabMm, t.altoFabMm),
      });
      if (p.escala !== "real") continue;

      const porFila = sumaAnchoPorFila(p.paneles);
      for (const [fila, suma] of porFila) {
        if (Math.abs(suma - p.exterior.anchoMm) > 0.01) {
          ofensores.push(`${d.id} @ ${t.anchoFabMm}x${t.altoFabMm} fila ${fila}: suma ancho=${suma} exterior=${p.exterior.anchoMm}`);
        }
      }

      // Alto: cada fila mide lo mismo en todos sus paneles (es el reparto de
      // fila, no de panel), así que basta tomar el primer panel de cada fila.
      const altosPorFila = [...new Map(p.paneles.map((x) => [x.fila, x.altoMm])).values()];
      const sumaAlto = altosPorFila.reduce((a, b) => a + b, 0);
      if (Math.abs(sumaAlto - p.exterior.altoMm) > 0.01) {
        ofensores.push(`${d.id} @ ${t.anchoFabMm}x${t.altoFabMm}: suma alto filas=${sumaAlto} exterior=${p.exterior.altoMm}`);
      }
    }
  }
  assert.deepEqual(ofensores, [], `${ofensores.length} caso(s) con suma incorrecta:\n${ofensores.join("\n")}`);
});

test("los 138 diseños reales a 1500x1200mm (tamaño intermedio): al menos 130 dan escala:'real'", () => {
  // Umbral pedido por la consigna ("al menos 130 de 138"), con margen: el
  // conteo real medido a este tamaño es 134/138. Los 4 que no resuelven a
  // escala real (Sistema5020Reforzado::OXO, Sistema8025::OXXXXO,
  // Sistema8025::OXXXXXXO_3P, Sistema8025::XXXXXX) no son un fallo del
  // parser ni del reparto: son diseños de 3+ cuerpos donde el despiece trae
  // MÁS clases de tamaño de paño de las que el código de letras puede
  // distinguir (p.ej. "OXXXXO" da 3 tamaños de paño distintos para sólo 2
  // tipos de letra, O y X — la geometría real del diseño es más fina que el
  // alfabeto O/X/W/B/P/Z). A tamaños grandes (2400x1800) esos mismos diseños
  // SÍ resuelven, porque la diferencia entre clases es un offset constante
  // en mm que se vuelve relativamente pequeña cuando el paño es grande — ver
  // test siguiente. La forma correcta de resolverlos a cualquier tamaño es
  // un override manual en geometria-overrides.json (paso 7), no forzar el
  // parser a adivinar.
  let real = 0;
  const esquemas = [];
  for (const d of disenos) {
    const p = calcularPlano({
      codigoDiseno: d.diseno,
      modulo: d.modulo,
      anchoFabMm: 1500,
      altoFabMm: 1200,
      vidrios: vidriosReales(d, 1500, 1200),
    });
    if (p.escala === "real") real++;
    else esquemas.push(d.id);
  }
  assert.ok(real >= 130, `sólo ${real}/138 dieron escala:real a 1500x1200mm. esquema: ${esquemas.join(", ")}`);
});

test("los 138 diseños reales a 2400x1800mm (tamaño grande): los 138 dan escala:'real'", () => {
  // A esta medida, hasta los 4 casos límite del test anterior resuelven por
  // el paso 6 (spread<3%): confirma que "esquema" en el test anterior es una
  // decisión de tamaño/proporción, no un diseño roto.
  let real = 0;
  const esquemas = [];
  for (const d of disenos) {
    const p = calcularPlano({
      codigoDiseno: d.diseno,
      modulo: d.modulo,
      anchoFabMm: 2400,
      altoFabMm: 1800,
      vidrios: vidriosReales(d, 2400, 1800),
    });
    if (p.escala === "real") real++;
    else esquemas.push(d.id);
  }
  assert.equal(esquemas.length, 0, `esquema inesperado en: ${esquemas.join(", ")}`);
  assert.equal(real, 138);
});
