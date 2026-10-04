// Pérgola y División / Fachada (2026-10-04): los dos productos nuevos.
//
// Vigila las reglas de cantidad que dio y validó el usuario (docs/modulos/
// cotizador.md → "Pérgola y División / Fachada") y su mano de obra. Las
// cantidades se comprueban por CÓDIGO, nunca por precio: los precios cambian
// con cada factura que entra por Proveedores.
//
// Precarga la caché (Postgres) — no escribe nada.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { calcularItem } from "../../cotizador/modules/registry";
import { composicionDe } from "../../cotizador/modules/divisionFachada";
import { calcularManoObraProductos, manoObraPorItem } from "../../cotizador/lib/cargos";
import { getParametros } from "../../cotizador/lib/catalogo";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASE = { segmentoCliente: "PA", cantidadPiezas: 1, conInstalacion: true, colorPerfileria: "mate" };
const cant = (r: any, codigo: string) => r.items.filter((l: any) => l.codigo === codigo).reduce((a: number, l: any) => a + l.cantidad, 0);
const sinErrores = (r: any) => assert.deepEqual(r.items.filter((l: any) => l.error).map((l: any) => l.codigo), []);

const SV_BATIENTE = { ...BASE, tipo: "solo-vidrio", apertura: "batiente", anchoCm: 300, altoCm: 240, numeroPuertas: 1, anchoPuertaCm: 90, numeroFijos: 2 };
const SV_CORREDIZA = { ...BASE, tipo: "solo-vidrio", apertura: "corrediza", anchoCm: 300, altoCm: 240, hojasCorredizas: 1, hojasFijas: 1 };
const ENM_BATIENTE = { ...BASE, tipo: "enmarcada", apertura: "batiente", anchoCm: 300, altoCm: 240, numeroPuertas: 1, anchoPuertaCm: 90, numeroFijos: 2 };
const ENM_CORREDIZA = { ...BASE, tipo: "enmarcada", apertura: "corrediza", anchoCm: 300, altoCm: 240, hojasCorredizas: 2, hojasFijas: 2 };

// ─── Pérgola ────────────────────────────────────────────────────────────────

test("pérgola: vidrio elegido y película de seguridad, los dos por m²", () => {
  const r: any = calcularItem("pergola", { ...BASE, anchoCm: 300, altoCm: 400, codigoVidrio: "CL8MM03LM" });
  sinErrores(r);
  assert.equal(cant(r, "CL8MM03LM"), 12);
  assert.equal(cant(r, "PEL0106"), 12);
  assert.match(r.descripcionComercial, /pérgola en vidrio laminado claro 4\+4, con película de seguridad/);
});

test("pérgola: sin vidrio elegido usa templado 6 mm; uno fuera de la lista cae a 6 mm con aviso", () => {
  assert.equal(cant(calcularItem("pergola", { ...BASE, anchoCm: 100, altoCm: 100 }), "CL6MM03SP"), 1);
  const r: any = calcularItem("pergola", { ...BASE, anchoCm: 100, altoCm: 100, codigoVidrio: "CL4MM01CR" });
  assert.equal(cant(r, "CL6MM03SP"), 1);
  assert.ok(r.advertencias.some((a: string) => /no se ofrece para pérgola/.test(a)));
});

test("los 6 vidrios de la pérgola tienen precio", () => {
  for (const v of ["CL6MM03SP", "CL8MM03SP", "CL10MM03SP", "CL6MM03LM", "CL8MM03LM", "CL10MM03LM"]) {
    sinErrores(calcularItem("pergola", { ...BASE, anchoCm: 200, altoCm: 200, codigoVidrio: v }));
  }
});

// ─── División: composición ──────────────────────────────────────────────────

test("composición batiente: el ancho que no ocupa la puerta se reparte en los fijos", () => {
  const c = composicionDe(SV_BATIENTE);
  assert.equal(c.moviles, 1);
  assert.equal(c.anchoMovilM, 0.9);
  assert.equal(c.fijos, 2);
  assert.ok(Math.abs(c.anchoFijoM - 1.05) < 1e-9);
});

test("composición: puertas más anchas que el total, o sin espacio para los fijos, se rechazan con mensaje", () => {
  assert.throws(() => composicionDe({ ...SV_BATIENTE, anchoPuertaCm: 400 }), /revisa el ancho de la puerta/);
  assert.throws(() => composicionDe({ ...SV_BATIENTE, anchoPuertaCm: 300 }), /no queda espacio para los fijos/);
  assert.throws(() => composicionDe({ ...SV_BATIENTE, anchoPuertaCm: "" }), /ancho de cada puerta/);
  assert.doesNotThrow(() => composicionDe({ ...SV_BATIENTE, anchoPuertaCm: 300, numeroFijos: 0 }));
});

test("composición corrediza: hojas de igual ancho; los selects llegan como texto y se aceptan", () => {
  const c = composicionDe({ ...SV_CORREDIZA, hojasCorredizas: "2", hojasFijas: "1" });
  assert.equal(c.moviles, 2);
  assert.equal(c.fijos, 1);
  assert.equal(c.anchoMovilM, 1);
});

// ─── División: materiales por variante ──────────────────────────────────────

test("solo vidrio batiente: 8 mm, 2 topes, manija, Yale + escudo, esquineros; fijos con U32 y perfil F", () => {
  const r: any = calcularItem("division-fachada", SV_BATIENTE);
  sinErrores(r);
  assert.equal(cant(r, "CL8MM03SP"), 7.2);
  assert.equal(cant(r, "ESU1102"), 1);
  assert.equal(cant(r, "EIN1102"), 1);
  assert.equal(cant(r, "TCA0301"), 2);
  assert.equal(cant(r, "MRO1101"), 1);
  assert.equal(cant(r, "CER0301"), 1);
  assert.equal(cant(r, "CCE0101"), 1);
  assert.equal(cant(r, "U320101"), 2.1);
  assert.equal(cant(r, "PER0301"), 4.8);
});

test("solo vidrio batiente con zócalo y recibidor: cambia el herraje, no lo demás", () => {
  const r: any = calcularItem("division-fachada", { ...SV_BATIENTE, numeroPuertas: 2, inferiorPuerta: "zocalo", seguridadPuerta: "recibidor" });
  sinErrores(r);
  assert.equal(cant(r, "ESU1102"), 0);
  assert.equal(cant(r, "ZSE0104"), 1.8); // 2 puertas × 0,90 m
  assert.equal(cant(r, "CRE1301"), 2);
  assert.equal(cant(r, "CER0301"), 0);
  assert.equal(cant(r, "TCA0301"), 4);
});

test("solo vidrio corrediza: riel × ancho, kit por hoja, T-70 = 2 parales × alto", () => {
  const r: any = calcularItem("division-fachada", SV_CORREDIZA);
  sinErrores(r);
  assert.equal(cant(r, "CL6MM03SP"), 7.2);
  assert.equal(cant(r, "ROS0301"), 3);
  assert.equal(cant(r, "KOP0102"), 1);
  assert.equal(cant(r, "MRO1101"), 1);
  assert.equal(cant(r, "CPI0101"), 1);
  assert.equal(cant(r, "TUB0103"), 4.8);
  assert.equal(cant(r, "U320101"), 1.5);
  assert.equal(cant(r, "PER0301"), 2.4);
});

test("solo vidrio corrediza: una hoja de más de 60 kg pide el kit de 80; más de 80 avisa", () => {
  // 1 hoja de 1,80 × 2,40 m en 6 mm ≈ 65 kg.
  const pesada: any = calcularItem("division-fachada", { ...SV_CORREDIZA, anchoCm: 180, hojasFijas: 0 });
  assert.equal(cant(pesada, "KOP0101"), 1);
  assert.equal(cant(pesada, "KOP0102"), 0);
  const muyPesada: any = calcularItem("division-fachada", { ...SV_CORREDIZA, anchoCm: 250, altoCm: 250, hojasFijas: 0 });
  assert.ok(muyPesada.advertencias.some((a: string) => /kit Optiglas más grande/.test(a)));
});

test("enmarcada batiente: T-244 con divisiones, 175/177 de los fijos, U57 de la puerta, 4 omegas", () => {
  const r: any = calcularItem("division-fachada", ENM_BATIENTE);
  sinErrores(r);
  assert.equal(cant(r, "TUB0102"), 15.6); // 2×3 + 2×2,4 + 2,4 × 2 divisiones
  assert.equal(cant(r, "SIL0103"), 13.8); // 2 fijos × 2 × (1,05 + 2,4)
  assert.equal(cant(r, "PPR0101"), 13.8);
  assert.equal(cant(r, "U570101"), 6.6); // 2 × (0,9 + 2,4)
  assert.equal(cant(r, "EMP1301"), 20.4);
  assert.equal(cant(r, "BAO0101"), 4);
  assert.equal(cant(r, "TCA0301"), 1);
  assert.equal(cant(r, "CHE0101"), 1);
});

test("enmarcada corrediza: riel Ducasse, 2 rodamientos por hoja corrediza, picoloro y tiradera", () => {
  const r: any = calcularItem("division-fachada", ENM_CORREDIZA);
  sinErrores(r);
  assert.equal(cant(r, "RDU0101"), 3);
  assert.equal(cant(r, "TUB0102"), 10.8);
  assert.equal(cant(r, "RDU0102"), 4);
  assert.equal(cant(r, "CPLEYALE"), 2);
  assert.equal(cant(r, "MMT0101"), 2);
  assert.equal(cant(r, "SIL0103"), 25.2); // 4 paños × 2 × (0,75 + 2,4)
});

test("color: se resuelve por perfil; el que no existe cae a mate con aviso", () => {
  const bronce: any = calcularItem("division-fachada", { ...ENM_BATIENTE, colorPerfileria: "bronce" });
  sinErrores(bronce);
  assert.equal(cant(bronce, "TUB0501"), 15.6);
  assert.equal(cant(bronce, "BAO0301"), 4);
  assert.deepEqual(bronce.advertencias, []);
  const gris: any = calcularItem("division-fachada", { ...ENM_BATIENTE, colorPerfileria: "gris plata" });
  assert.equal(cant(gris, "TUB0102"), 15.6);
  assert.ok(gris.advertencias.some((a: string) => /El tubular T-244 no existe en color gris plata/.test(a)));
});

test("frase comercial de la división", () => {
  assert.match(
    (calcularItem("division-fachada", SV_BATIENTE) as any).descripcionComercial,
    /^Suministro e instalación de división en vidrio templado 8 mm, batiente con 1 puerta y 2 fijos, medidas 3\.000 × 2\.400 mm$/
  );
  assert.match(
    (calcularItem("division-fachada", ENM_CORREDIZA) as any).descripcionComercial,
    /división enmarcada en aluminio color mate, vidrio templado 6 mm, corrediza con 2 hojas corredizas y 2 fijas/
  );
});

// ─── Mano de obra ───────────────────────────────────────────────────────────

test("mano de obra: $120.000/m² en pérgola y división, mínimo 1 m², solo con instalación", () => {
  const p = getParametros();
  assert.equal(p.mo_instalacion_pergola_m2, 120000);
  assert.equal(p.mo_instalacion_division_m2, 120000);
  const lineas = calcularManoObraProductos([
    { moduloId: "pergola", input: { anchoCm: 300, altoCm: 400, cantidadPiezas: 1, conInstalacion: true } },
    { moduloId: "pergola", input: { anchoCm: 50, altoCm: 50, cantidadPiezas: 2, conInstalacion: true } }, // 2 × mínimo 1 m²
    { moduloId: "division-fachada", input: { anchoCm: 300, altoCm: 240, cantidadPiezas: 1, conInstalacion: true } },
    { moduloId: "division-fachada", input: { anchoCm: 300, altoCm: 240, cantidadPiezas: 1, conInstalacion: false } },
  ]);
  const pergola = lineas.find((l) => l.descripcion === "Instalación pérgolas");
  const division = lineas.find((l) => l.descripcion === "Instalación divisiones y fachadas");
  assert.equal(pergola?.cantidad, 14);
  assert.equal(division?.cantidad, 7.2);
  assert.equal(pergola?.valorUnitario, Math.round((120000 / Number(p.aiu)) * 100) / 100);
});

test("mano de obra por ítem (reparto del PDF) coincide con las líneas", () => {
  const items = [
    { moduloId: "pergola", input: { anchoCm: 300, altoCm: 400, cantidadPiezas: 1, conInstalacion: true } },
    { moduloId: "division-fachada", input: { anchoCm: 300, altoCm: 240, cantidadPiezas: 1, conInstalacion: true } },
  ];
  const porItem = manoObraPorItem(items);
  const total = calcularManoObraProductos(items).reduce((a, l) => a + l.cantidad * l.valorUnitario, 0);
  assert.ok(Math.abs(porItem[0] + porItem[1] - total) < 0.05);
  assert.ok(porItem[0] > 0 && porItem[1] > 0);
});
