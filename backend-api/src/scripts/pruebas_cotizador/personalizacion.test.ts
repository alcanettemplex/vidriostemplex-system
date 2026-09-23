// Pruebas de la personalización de componentes (2026-09-23): cambiar, quitar y
// agregar componentes sobre el despiece que arma el motor de un módulo.
// Precarga la caché: los precios salen del catálogo real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { calcularItem, getModulo } from "../../cotizador/modules/registry";
import { evaluarAptitudOrden } from "../../cotizador/lib/aptitudOrden";
import { DESPERDICIO_PERFIL_EXTRA_PCT } from "../../cotizador/lib/personalizacion";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

// Ventana 744 por medidas libres: trae chapa (CHJ0101) y empaque (EMP1305).
const VENTANA_744 = {
  sistema: "744", colorPerfileria: "mate", anchoCm: 150, altoCm: 120, cuerpos: 2, alasCorredizas: 1,
  codigoVidrio: "CL4MM01CR", segmentoCliente: "PA", cantidadPiezas: 1,
};
// Ventana 5020 por diseño: trae cortes (despiece real) y vidrio.
const VENTANA_5020 = {
  disenoId: "Sistema5020::OX", anchoCm: 150, altoCm: 120, colorPerfileria: "mate",
  codigoVidrio: "CL4MM01CR", segmentoCliente: "PA", cantidadPiezas: 1,
};

const linea = (r: any, codigo: string) => (r.items as any[]).find((l) => l.codigo === codigo);

test("sin personalización el resultado es idéntico al del motor", () => {
  const motor = getModulo("ventanas")!.calcular(VENTANA_744);
  assert.deepEqual(calcularItem("ventanas", VENTANA_744), motor);
  assert.deepEqual(calcularItem("ventanas", { ...VENTANA_744, personalizacion: { cambios: [], quitados: [], extras: [] } }), motor);
});

test("cambiar la chapa por otra de la misma unidad reemplaza la línea y rehace el total", () => {
  const base = calcularItem("ventanas", VENTANA_744);
  const chapa = linea(base, "CHJ0101");
  assert.ok(chapa, "la ventana 744 debería traer la chapa CHJ0101");

  const r = calcularItem("ventanas", { ...VENTANA_744, personalizacion: { cambios: [{ de: "CHJ0101", a: "CPDC0101" }] } });
  assert.equal(linea(r, "CHJ0101"), undefined);
  const nueva = linea(r, "CPDC0101");
  assert.equal(nueva.personalizada, "cambiada");
  assert.equal(nueva.codigoOriginal, "CHJ0101");
  assert.equal(nueva.cantidad, chapa.cantidad);
  const delta = nueva.valorTotal - chapa.valorTotal;
  assert.ok(Math.abs(r.subtotalPieza - (base.subtotalPieza + delta)) < 0.02, "el subtotal sube exactamente la diferencia");
  assert.ok(r.total > base.total);
  assert.equal(r.personalizacion.cambios.length, 1);
  assert.equal(r.perfileriaPersonalizada, undefined, "una chapa no es perfilería");
});

test("no se puede cambiar un componente por otro de distinta unidad", () => {
  assert.throws(
    () => calcularItem("ventanas", { ...VENTANA_744, personalizacion: { cambios: [{ de: "CHJ0101", a: "CL4MM01CR" }] } }),
    /metro cuadrado/
  );
});

test("un código nuevo que no existe se rechaza con mensaje claro", () => {
  assert.throws(
    () => calcularItem("ventanas", { ...VENTANA_744, personalizacion: { cambios: [{ de: "CHJ0101", a: "NOEXISTE99" }] } }),
    /no existe/
  );
});

test("quitar un componente lo saca del despiece y lo deja listado para restaurar", () => {
  const base = calcularItem("ventanas", VENTANA_744);
  const empaque = linea(base, "EMP1305");
  assert.ok(empaque, "la ventana 744 debería traer el empaque EMP1305");
  const r = calcularItem("ventanas", { ...VENTANA_744, personalizacion: { quitados: ["EMP1305"] } });
  assert.equal(linea(r, "EMP1305"), undefined);
  assert.equal(r.personalizacion.quitados[0].codigo, "EMP1305");
  assert.ok(Math.abs(r.subtotalPieza - (base.subtotalPieza - empaque.valorTotal)) < 0.02);
});

test("un cambio cuyo componente ya no está se ignora con aviso, sin romper", () => {
  const r = calcularItem("ventanas", { ...VENTANA_744, personalizacion: { cambios: [{ de: "ZZZ0000", a: "CPDC0101" }] } });
  assert.ok(r.advertencias.some((a: string) => a.includes("ya no aplica")));
  assert.equal(r.personalizacion.cambios.length, 0);
});

test("un perfil agregado se cobra en metros con el 5 % y deja el ítem no apto para corte", () => {
  const r = calcularItem("ventanas", {
    ...VENTANA_5020,
    personalizacion: { extras: [{ codigo: "JAM0108", medidaMm: 630, piezas: 2 }] },
  });
  const extra = linea(r, "JAM0108");
  const esperado = Math.round(((630 * 2) / 1000) * (1 + DESPERDICIO_PERFIL_EXTRA_PCT / 100) * 10000) / 10000;
  assert.equal(extra.cantidad, esperado);
  assert.equal(extra.personalizada, "agregada");
  assert.equal(r.perfileriaPersonalizada, true);
  assert.equal(r.aptoParaCorte, false);
  const corte = (r.cortes.perfiles as any[]).find((c) => c.ref === "AGREGADO");
  assert.equal(corte.medidaMm, 630);
  assert.equal(corte.cantidad, 2);
});

test("un perfil agregado sin medida se rechaza", () => {
  assert.throws(
    () => calcularItem("ventanas", { ...VENTANA_5020, personalizacion: { extras: [{ codigo: "JAM0108", cantidad: 2 }] } }),
    /milímetros/
  );
});

test("cambiar el vidrio cambia el nombre del paño en los cortes y NO afecta la aptitud", () => {
  const base = calcularItem("ventanas", VENTANA_5020);
  const r = calcularItem("ventanas", {
    ...VENTANA_5020,
    personalizacion: { cambios: [{ de: "CL4MM01CR", a: "BR4MM01CR" }] },
  });
  assert.ok(linea(r, "BR4MM01CR"));
  for (const v of r.cortes.vidrios as any[]) assert.match(String(v.descripcion), /BRONCE/);
  assert.equal(r.aptoParaCorte, base.aptoParaCorte);
  assert.equal(r.perfileriaPersonalizada, undefined);
});

test("la orden de corte reporta PERFILERIA_PERSONALIZADA y no un falso 'diseño cambió'", () => {
  const input = { ...VENTANA_5020, personalizacion: { extras: [{ codigo: "JAM0108", medidaMm: 630, piezas: 2 }] } };
  const resultado = calcularItem("ventanas", input);
  const aptitud = evaluarAptitudOrden({
    estado: "APROBADA",
    items: [{ id: 1, moduloId: "ventanas", input, resultado }],
  } as any);
  const texto = JSON.stringify(aptitud);
  assert.ok(texto.includes("PERFILERIA_PERSONALIZADA"));
  assert.ok(!texto.includes("MEDIDA_PERFIL_DESACTUALIZADA"));
  assert.ok(!texto.includes("DESPIECE_NO_VERIFICABLE"));
});
