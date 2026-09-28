// Detalles del Cotizador corregidos el 2026-09-27 (decisiones del usuario):
//
// - Cerrojo CPTOR: uno por ventana, SOLO en el 5020. Ni el 5020 Reforzado
//   (cierra con su traslape reforzado) ni 744 / 8025 / 7038 lo llevan. La
//   8025 lleva su chapa CH8025S.
// - Película: lista del catálogo (ya no sí/no a PELI31). `true` sigue valiendo
//   como PELI31; una película sin precio se cotiza con el costo del asesor.
// - `codigoErp` en las líneas cuyo código del Cotizador difiere del ERP.
//
// Precarga la caché (abre conexión): correrla con el backend dev abajo, o sola
// — ver "Bajar el backend dev antes de correrlas" en docs/modulos/cotizador.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { getProducto } from "../../cotizador/lib/catalogo";
import { calcularItem, listarModulos } from "../../cotizador/modules/registry";
import { listarPeliculas, codigoPelicula } from "../../cotizador/lib/peliculas";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

type Linea = { codigo: string; codigoErp?: string; cantidad: number; error: boolean; precioACotizar?: boolean; costoManual?: number };
type Resultado = { items: Linea[]; hayErrores: boolean; advertencias: string[] };

function ventana(disenoId: string | null, extra: Record<string, unknown> = {}): Resultado {
  return calcularItem("ventanas", {
    segmentoCliente: "PA",
    sistema: disenoId ? disenoId.replace(/^Sistema/, "").slice(0, 4) : "5020",
    colorPerfileria: "mate",
    anchoCm: 150,
    altoCm: 120,
    cuerpos: 2,
    codigoVidrio: "CL4MM01CR",
    cantidadPiezas: 1,
    ...(disenoId ? { disenoId } : {}),
    ...extra,
  } as never) as Resultado;
}

const cuenta = (r: Resultado, codigo: string) =>
  r.items.filter((l) => l.codigo === codigo).reduce((acc, l) => acc + l.cantidad, 0);

test("5020 por diseño lleva UN cerrojo CPTOR", () => {
  assert.equal(cuenta(ventana("Sistema5020::XX"), "CPTOR"), 1);
});

test("5020 por medidas libres lleva UN cerrojo CPTOR", () => {
  assert.equal(cuenta(ventana(null), "CPTOR"), 1);
});

test("5020 Reforzado no lleva cerrojo, pero sí el resto de accesorios del 5020", () => {
  const r = ventana("Sistema5020Reforzado::XX");
  assert.equal(cuenta(r, "CPTOR"), 0);
  assert.ok(cuenta(r, "RODA5020") > 0, "debe conservar el rodamiento del 5020");
});

test("8025 no lleva cerrojo y sí su chapa CH8025S", () => {
  const r = ventana("Sistema8025::XX");
  assert.equal(cuenta(r, "CPTOR"), 0);
  assert.ok(cuenta(r, "CH8025S") > 0);
});

test("744 no lleva cerrojo", () => {
  assert.equal(cuenta(ventana("Sistema744::XX"), "CPTOR"), 0);
});

test("la lista de películas sale del catálogo, con PELI31 primero y todas en ACABADO", () => {
  const pelis = listarPeliculas();
  assert.equal(pelis[0]?.codigo, "PELI31");
  assert.ok(pelis.length >= 27, `se esperaban al menos 27 películas, hay ${pelis.length}`);
  for (const p of pelis) assert.equal(p.categoria, "ACABADO", p.codigo);
});

test("el campo película de ventanas, proyectantes y tablero trae las opciones del catálogo", () => {
  for (const id of ["ventanas", "proyectantes", "tablero"]) {
    const campo = listarModulos().find((m) => m.id === id)?.campos.find((c) => (c as { nombre?: string }).nombre === "pelicula") as
      | { tipo: string; opciones: { value: string }[] }
      | undefined;
    assert.equal(campo?.tipo, "select", id);
    assert.ok((campo?.opciones.length ?? 0) > 20, `${id}: faltan opciones`);
    assert.equal(campo?.opciones[0].value, "", `${id}: la primera opción es "Sin película"`);
  }
});

test("`true` de antes sigue cobrando PELI31", () => {
  assert.equal(codigoPelicula(true), "PELI31");
  assert.equal(cuenta(ventana("Sistema5020::XX", { pelicula: true }), "PELI31") > 0, true);
});

test("una película con precio se cobra por su código", () => {
  const r = ventana("Sistema5020::XX", { pelicula: "PEL0103" });
  assert.ok(cuenta(r, "PEL0103") > 0);
  assert.equal(r.hayErrores, false);
});

test("película sin precio: sin costo bloquea, con costo se cobra y avisa", () => {
  assert.equal(getProducto("PEL0108")?.precioACotizar, true);
  const sinCosto = ventana("Sistema5020::XX", { pelicula: "PEL0108" });
  assert.equal(sinCosto.hayErrores, true);
  const conCosto = ventana("Sistema5020::XX", { pelicula: "PEL0108", costoPelicula: 30000 });
  const linea = conCosto.items.find((l) => l.codigo === "PEL0108");
  assert.equal(linea?.error, false);
  assert.equal(linea?.costoManual, 30000);
  assert.ok(conCosto.advertencias.some((a) => a.includes("PEL0108")));
});

test("tablero cobra la película elegida en m²", () => {
  const r = calcularItem("tablero", {
    segmentoCliente: "PA", anchoCm: 100, altoCm: 50, espesorMm: 6, pelicula: "PEL0103", cantidadPiezas: 1,
  } as never) as Resultado;
  assert.equal(cuenta(r, "PEL0103"), 0.5);
});

test("las líneas con código heredado traen el código del ERP", () => {
  assert.equal(getProducto("CPTOR")?.codigoErp, "CPTOR01");
  const linea = ventana("Sistema5020::XX").items.find((l) => l.codigo === "CPTOR");
  assert.equal(linea?.codigoErp, "CPTOR01");
  // Un código que ya es el del ERP no repite el dato.
  assert.equal(getProducto("CH8025S")?.codigoErp, undefined);
});
