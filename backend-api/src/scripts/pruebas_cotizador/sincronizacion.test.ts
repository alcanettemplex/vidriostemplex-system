// Pruebas de la regla que elige el proveedor que fija el costo en el Cotizador
// (`elegirCandidato` en `cotizador/lib/sincronizacionProveedores.ts`).
//
// Regla del usuario, 2026-09-28: gana el COSTO NORMALIZADO MÁS ALTO entre los
// precios de los últimos 6 meses (si ninguno entra, todos), prefiriendo la tira
// de 6 m en perfilería. Hasta ese día ganaba el más barato.
//
// Pura: no precarga la caché ni consulta Postgres (importar el módulo sólo
// instancia Sequelize, no abre conexión).
import { test } from "node:test";
import assert from "node:assert/strict";

import { elegirCandidato, fechaLimiteVigencia, MESES_VIGENCIA_PRECIO } from "../../cotizador/lib/sincronizacionProveedores";
import type { Candidato } from "../../cotizador/lib/sincronizacionProveedores";

const HOY = new Date("2026-09-28T12:00:00Z");

let siguienteId = 1;
function cand(nombre: string, unidadCompra: string, precio: number, fechaPrecio: string | null = "2026-09-01"): Candidato {
  return {
    proveedorProductoId: siguienteId++,
    proveedorId: siguienteId,
    proveedorNombre: nombre,
    unidadCompra,
    precio,
    costoNormalizado: unidadCompra === "TIRA_6M" ? precio / 6 : precio,
    fechaPrecio,
  };
}

test("gana el costo más alto: JAM0108 toma VENTANAS Y PUERTAS, no GRUPO ROLDAN", () => {
  const lista = [cand("GRUPO ROLDAN", "TIRA_6M", 42900, "2026-08-18"), cand("VENTANAS Y PUERTAS", "TIRA_6M", 83277.31, "2026-08-19")];
  assert.equal(elegirCandidato(lista, "PERFILERIA", HOY)?.proveedorNombre, "VENTANAS Y PUERTAS");
});

test("un solo candidato gana siempre, aunque sea viejo", () => {
  const unico = cand("UNICO", "M2", 55200, "2025-01-01");
  assert.equal(elegirCandidato([unico], "VIDRIO", HOY), unico);
});

test("lista vacía → null", () => {
  assert.equal(elegirCandidato([], "VIDRIO", HOY), null);
});

test("vigencia: un precio alto de hace más de 6 meses no le gana a uno reciente", () => {
  const lista = [cand("VIEJO CARO", "M2", 90000, "2026-03-01"), cand("RECIENTE", "M2", 60000, "2026-09-10")];
  assert.equal(elegirCandidato(lista, "VIDRIO", HOY)?.proveedorNombre, "RECIENTE");
});

test("vigencia: si ninguno entra en la ventana compiten todos y gana el más alto", () => {
  const lista = [cand("A", "M2", 50000, "2025-12-01"), cand("B", "M2", 70000, "2025-06-01")];
  assert.equal(elegirCandidato(lista, "VIDRIO", HOY)?.proveedorNombre, "B");
});

test("vigencia: sin fecha cuenta como fuera de la ventana", () => {
  const lista = [cand("SIN FECHA", "M2", 99999, null), cand("CON FECHA", "M2", 10000, "2026-09-20")];
  assert.equal(elegirCandidato(lista, "VIDRIO", HOY)?.proveedorNombre, "CON FECHA");
});

test("vigencia: el borde exacto de 6 meses entra", () => {
  const limite = fechaLimiteVigencia(HOY);
  assert.equal(limite, "2026-03-28");
  const lista = [cand("EN EL BORDE", "M2", 80000, limite), cand("DENTRO", "M2", 70000, "2026-09-01")];
  assert.equal(elegirCandidato(lista, "VIDRIO", HOY)?.proveedorNombre, "EN EL BORDE");
  assert.equal(MESES_VIGENCIA_PRECIO, 6);
});

test("perfilería: la tira gana sobre el metro aunque el metro normalizado sea más alto", () => {
  // Metro suelto ~30 % más caro que tira ÷ 6: con la regla del más alto
  // ganaría siempre si no se prefiriera la tira.
  const lista = [cand("TIRA", "TIRA_6M", 60000), cand("METRO", "METRO", 13000)];
  assert.equal(elegirCandidato(lista, "PERFILERIA", HOY)?.proveedorNombre, "TIRA");
});

test("perfilería: entre dos tiras gana la de costo por metro más alto", () => {
  const lista = [cand("TIRA A", "TIRA_6M", 48000), cand("TIRA B", "TIRA_6M", 54000), cand("METRO", "METRO", 20000)];
  assert.equal(elegirCandidato(lista, "PERFILERIA", HOY)?.proveedorNombre, "TIRA B");
});

test("perfilería: sin tiras, compite el precio por metro", () => {
  const lista = [cand("M1", "METRO", 9000), cand("M2", "METRO", 9700)];
  assert.equal(elegirCandidato(lista, "PERFILERIA", HOY)?.proveedorNombre, "M2");
});

test("perfilería: una tira vieja no le gana a un metro reciente (la vigencia va antes que la modalidad)", () => {
  const lista = [cand("TIRA VIEJA", "TIRA_6M", 90000, "2026-01-15"), cand("METRO NUEVO", "METRO", 12000, "2026-09-15")];
  assert.equal(elegirCandidato(lista, "PERFILERIA", HOY)?.proveedorNombre, "METRO NUEVO");
});

test("fuera de perfilería no hay modalidad preferida: gana el más alto por su costo", () => {
  const lista = [cand("TIRA", "TIRA_6M", 60000), cand("UNIDAD", "UNIDAD", 12000)];
  assert.equal(elegirCandidato(lista, "ACCESORIO", HOY)?.proveedorNombre, "UNIDAD");
});

test("fechaLimiteVigencia resta meses en calendario, también cruzando el año", () => {
  assert.equal(fechaLimiteVigencia(new Date("2026-02-15T00:00:00Z")), "2025-08-15");
});
