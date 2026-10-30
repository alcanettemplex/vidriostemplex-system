// Vidrio de Ventanas, Proyectantes y Pérgola: listado completo del catálogo (2026-10-30).
//
// Vigila las decisiones del usuario (ver lib/vidrios.ts): los tres productos
// ofrecen el mismo listado, sale del catálogo, deja fuera lo que no tiene precio
// y lo que no es vidrio por m², y el motor acepta exactamente lo que ofrece.
//
// Precarga la caché (Postgres) — no escribe nada.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { calcularItem, listarModulos } from "../../cotizador/modules/registry";
import { opcionesVidrio, esVidrioValido, nombreComercialVidrio } from "../../cotizador/lib/vidrios";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = { segmentoCliente: "PA", cantidadPiezas: 1, conInstalacion: true, colorPerfileria: "mate" };
const valores = (opciones: { value: string }[]) => opciones.map((o) => o.value);

test("Ventanas, Proyectantes y Pérgola ofrecen el mismo listado, el del catálogo", () => {
  const esperado = valores(opcionesVidrio());
  assert.ok(esperado.length > 8, "el listado debería superar la lista fija de antes (8)");
  for (const id of ["ventanas", "proyectantes", "pergola"]) {
    const campo: any = listarModulos().find((m) => m.id === id)?.campos.find((c: any) => c.nombre === "codigoVidrio");
    assert.deepEqual(valores(campo?.opciones ?? []), esperado, id);
  }
});

test("los productos de espesor fijo (cabinas, tablero) no cambian", () => {
  for (const id of ["cabinas-batientes", "cabinas-corredizas", "tablero"]) {
    const campos = listarModulos().find((m) => m.id === id)?.campos ?? [];
    assert.equal(campos.some((c: any) => c.nombre === "codigoVidrio"), false, id);
  }
});

test("fuera del listado: sin precio, espejos, guía de piso y BPB por metro", () => {
  const ofrecidos = new Set(valores(opcionesVidrio()));
  for (const codigo of ["CL4MM03LM", "CL4MM08SP", "ES0001", "ESP4MMBPB", "GPI1102", "VC10MMBPB"]) {
    assert.equal(ofrecidos.has(codigo), false, codigo);
    assert.equal(esVidrioValido(codigo), false, codigo);
  }
  for (const codigo of ["CL4MM01CR", "CL10MM03LM", "BR6MM01CR", "GR6MM03SP", "VMINIBOR"]) {
    assert.ok(ofrecidos.has(codigo), codigo);
  }
});

test("etiquetas legibles: sin 'VIDRIO', espesor en mm y la línea en mayúscula", () => {
  const etiqueta = (codigo: string) => opcionesVidrio().find((o) => o.value === codigo)?.label;
  assert.equal(etiqueta("CL6MM03SP"), "Claro 6 mm templado SP");
  assert.equal(etiqueta("GR6MM03SP"), "Gris 6 mm templado SP");
  assert.equal(etiqueta("CL10MM03LM"), "Claro 5+5 laminado");
});

test("el motor cotiza cualquier vidrio del listado, sin cambiarlo ni avisar", () => {
  const ventana: any = calcularItem("ventanas", { ...BASE, sistema: "744", anchoCm: 100, altoCm: 100, cuerpos: 2, codigoVidrio: "BR6MM01CR" });
  assert.ok(ventana.items.some((l: any) => l.codigo === "BR6MM01CR" && !l.error));
  assert.equal(ventana.advertencias.some((a: string) => /no se puede cotizar/.test(a)), false);

  const proyectante: any = calcularItem("proyectantes", { ...BASE, numeroNaves: 1, anchoNaveCm: 60, altoNaveCm: 60, codigoVidrio: "CL10MM03LM" });
  assert.ok(proyectante.items.some((l: any) => l.codigo === "CL10MM03LM" && !l.error));
});

test("proyectantes: un vidrio que no se puede cotizar cae al claro 4 mm crudo CON aviso", () => {
  const r: any = calcularItem("proyectantes", { ...BASE, numeroNaves: 1, anchoNaveCm: 60, altoNaveCm: 60, codigoVidrio: "CL4MM08SP" });
  assert.ok(r.items.some((l: any) => l.codigo === "CL4MM01CR"));
  assert.ok(r.advertencias.some((a: string) => /no se puede cotizar/.test(a)));
});

test("descripción comercial: nombre del catálogo, sin la línea SP", () => {
  assert.equal(nombreComercialVidrio("CL5MM03SP"), "claro 5 mm templado");
  assert.equal(nombreComercialVidrio("BR6MM01CR"), "bronce 6 mm crudo");
  const r: any = calcularItem("ventanas", { ...BASE, sistema: "744", anchoCm: 100, altoCm: 100, cuerpos: 2, codigoVidrio: "GR6MM01CR" });
  assert.match(r.descripcionComercial, /vidrio gris 6 mm crudo/);
});
