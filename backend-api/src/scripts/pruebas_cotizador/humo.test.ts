// Prueba de humo: no valida reglas de negocio, sólo que el sistema arranca y
// las piezas centrales no se rompieron al tocarlas. Se corre con
// `node --test` (integrado en Node desde la v18, cero dependencias) — no hay
// runner que instalar ni configurar.
//
// Sirve de red mínima mientras se refactoriza lib/catalogo (módulo de
// precios) y cotizarPorDiseno (parser de código de diseño): si alguno de
// estos tres números cambia sin que nadie lo esperara, esto falla antes de
// que lo note un cliente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcular as calcularVentanas } from "../../cotizador/modules/ventanas";
import { listarCatalogo } from "../../cotizador/lib/catalogo";
import { listarDisenos } from "../../cotizador/lib/motorDespiece";

import { before, after } from "node:test";
import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";

// Los motores leen el catálogo y los diseños de la caché en memoria, que se
// alimenta de Postgres: hay que precargarla antes de la primera aserción.
before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });


test("cotizar Sistema5020::OX a 150x120 da un total positivo sin errores", () => {
  const r = calcularVentanas({
    disenoId: "Sistema5020::OX",
    anchoCm: 150,
    altoCm: 120,
    colorPerfileria: "mate",
    codigoVidrio: "CL4MM01CR",
    segmentoCliente: "PA",
    cantidadPiezas: 1,
  });
  assert.equal(r.hayErrores, false, "no debería haber líneas en error");
  assert.ok(r.total > 0, `el total debería ser positivo, dio ${r.total}`);
});

// 432 y no 430 desde el 2026-09-11: al regenerar el catálogo contra el Excel
// matriz entraron dos códigos que la siembra original no tenía (KDG1106, kit
// deslizante Glasvit negro, y KOP0102, kit Optiglas de 60 kg).
//
// 435 y no 432 desde el 2026-09-12: se dieron de alta tres referencias del
// sistema 7038 que el taller confirmó (GIN7038 y los dos rodamientos
// ROD7038ABB/ROD7038NY), vía POST /api/cotizador/precios.
//
// El número sigue siendo un centinela a propósito — si cambia sin que nadie lo
// espere, es que se mezclaron los precios provisionales con el catálogo real.
test("el catálogo tiene los 435 productos extraídos del Excel", () => {
  const productos = listarCatalogo();
  assert.equal(productos.length, 435);
});

test("el catálogo de diseños tiene los 163 diseños generados", () => {
  // soloCotizables:false para contar el universo completo, no sólo los 120
  // que hoy tienen todos sus precios — ese número sí cambia con el catálogo.
  const disenos = listarDisenos({ soloCotizables: false });
  assert.equal(disenos.length, 163);
});
