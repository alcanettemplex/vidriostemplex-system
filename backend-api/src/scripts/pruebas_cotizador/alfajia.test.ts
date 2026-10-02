// Alfajía de las ventanas (2026-10-01, decisiones del usuario — ver
// lib/alfajias.ts y docs/modulos/cotizador.md):
//
// - Se elige en un selector; sin elección se cobra la RECOMENDADA del sistema
//   (5020 → S-332, 744/8025 → 1123, 7038 → 413) en el color de la ventana.
// - El color de la alfajía es el de la perfilería: otra de otro color es error.
// - Por diseño entra al DESPIECE como perfil (cortes + SAP) con la fórmula de la
//   pieza de alfajía del diseño; un sillar alfajía reemplaza al sillar.
// - El PDF dice "con alfajía …" solo si se cobró.
//
// Precarga la caché (abre conexión): correrla con el backend dev abajo, o sola.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { calcularItem } from "../../cotizador/modules/registry";
import {
  analizarAlfajia, codigoRecomendado, resolverAlfajia, nombreAlfajia, opcionesAlfajia,
} from "../../cotizador/lib/alfajias";
import { itemsParaSap } from "../../cotizador/lib/itemsParaSap";
import type { CortePerfil } from "../../cotizador/tipos";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

type Linea = { codigo: string; cantidad: number; error: boolean; descripcion: string };
type Resultado = {
  items: Linea[];
  hayErrores: boolean;
  advertencias: string[];
  cortes?: { perfiles: CortePerfil[] };
  descripcionComercial?: string;
};

function ventana(sistema: string, disenoId: string | null, extra: Record<string, unknown> = {}): Resultado {
  return calcularItem("ventanas", {
    segmentoCliente: "PA",
    sistema,
    colorPerfileria: "mate",
    anchoCm: 150,
    altoCm: 120,
    cuerpos: 2,
    codigoVidrio: "CL4MM01CR",
    cantidadPiezas: 1,
    ...(disenoId ? { disenoId } : {}),
    ...extra,
  } as never) as unknown as Resultado;
}

const lineas = (r: Resultado, codigo: string) => r.items.filter((l) => l.codigo === codigo);
const corte = (r: Resultado, codigo: string) => (r.cortes?.perfiles ?? []).find((c) => c.codigo === codigo);

// ─── Lectura del catálogo ───────────────────────────────────────────────────

test("analizarAlfajia lee tipo, referencia y color", () => {
  assert.deepEqual(analizarAlfajia("ALFAJIA S-332 MATE"), { tipo: "alfajia", ref: "332", refVisible: "S-332", color: "mate", sistema: null });
  assert.equal(analizarAlfajia("ALFAJIA 612 MATE 10CM")?.ref, "612");
  assert.equal(analizarAlfajia("ALFAJIA 1123 GRIS PLATA")?.color, "gris plata");
  assert.equal(analizarAlfajia("ALFAJIA 413 BLANCO")?.color, "blanco");
  assert.deepEqual(analizarAlfajia("5020 SILLAR ALFAJIA 581 BRONCE"), { tipo: "sillar", ref: "581", refVisible: "581", color: "bronce", sistema: "5020" });
  assert.equal(analizarAlfajia("SILLAR ALFAJIA 616"), null, "sin color no se ofrece");
  assert.equal(analizarAlfajia("SILLAR 5020"), null);
});

test("recomendada por sistema en el color de la ventana", () => {
  assert.equal(codigoRecomendado("5020", "mate"), "ALF0101");
  assert.equal(codigoRecomendado("744", "mate"), "ALF0111");
  assert.equal(codigoRecomendado("8025", "negro"), "ALF0601");
  assert.equal(codigoRecomendado("7038", "bronce"), "ALF0502");
  assert.equal(codigoRecomendado("744", "crudo"), null, "la 1123 no existe en crudo");
});

test("el selector trae color y referencia para filtrar en el formulario", () => {
  const op = opcionesAlfajia().find((o) => o.value === "ALF0111");
  assert.ok(op);
  assert.equal(op!.color, "mate");
  assert.equal(op!.ref, "1123");
});

// ─── Validación ─────────────────────────────────────────────────────────────

test("sin casilla no lleva alfajía, aunque venga un código", () => {
  assert.equal(resolverAlfajia({ alfajia: false, alfajiaCodigo: "ALF0111", sistema: "744", colorPerfileria: "mate" }).tipo, "ninguna");
});

test("una alfajía de otro color es error", () => {
  const r = resolverAlfajia({ alfajia: true, alfajiaCodigo: "ALF0601", sistema: "744", colorPerfileria: "mate" });
  assert.equal(r.tipo, "error");
});

test("un sillar alfajía de otro sistema es error", () => {
  const r = resolverAlfajia({ alfajia: true, alfajiaCodigo: "SIA0102", sistema: "744", colorPerfileria: "mate" });
  assert.equal(r.tipo, "error");
});

// ─── Cobro y despiece por diseño ────────────────────────────────────────────

test("744 por diseño: cobra la 1123 recomendada y la pone en los cortes", () => {
  const r = ventana("744", "Sistema744::XX", { alfajia: true });
  assert.equal(r.hayErrores, false);
  assert.ok(lineas(r, "ALF0111").length === 1, "una sola línea de alfajía");
  const c = corte(r, "ALF0111");
  assert.ok(c, "la alfajía debe estar en los cortes (Hoja de trabajo y SAP)");
  assert.ok(c!.medidaMm > 1000 && c!.medidaMm < 1600, `medida de corte razonable para 1.500 mm: ${c!.medidaMm}`);
});

test("sin casilla, la pieza de alfajía del diseño NO entra", () => {
  const r = ventana("744", "Sistema744::XX");
  assert.equal((r.cortes?.perfiles ?? []).some((c) => /alfaj/i.test(String(c.descripcion))), false);
});

test("la alfajía elegida manda sobre la recomendada", () => {
  const r = ventana("744", "Sistema744::XX", { alfajia: true, alfajiaCodigo: "ALF0102" });
  assert.equal(lineas(r, "ALF0111").length, 0);
  assert.equal(lineas(r, "ALF0102").length, 1);
  assert.ok(corte(r, "ALF0102"));
});

test("5020 por diseño: alfajía S-332 debajo del sillar normal (no cobra el SIA0102)", () => {
  const r = ventana("5020", "Sistema5020::XX", { alfajia: true });
  assert.equal(lineas(r, "ALF0101").length, 1);
  assert.equal(lineas(r, "SIA0102").length, 0, "ya no se cobra el sillar alfajía de más");
  assert.ok((r.cortes?.perfiles ?? []).some((c) => /^sillar$/i.test(String(c.descripcion))), "el sillar normal sigue");
});

test("5020 con sillar alfajía 581: reemplaza al sillar, una sola pieza", () => {
  const r = ventana("5020", "Sistema5020::XX", { alfajia: true, alfajiaCodigo: "SIA0102" });
  assert.equal(r.hayErrores, false);
  assert.equal(lineas(r, "SIA0102").length, 1);
  assert.equal(lineas(r, "ALF0101").length, 0, "no se suma la alfajía suelta");
  assert.equal((r.cortes?.perfiles ?? []).some((c) => /^sillar$/i.test(String(c.descripcion))), false, "el sillar fue reemplazado");
  assert.ok(corte(r, "SIA0102"));
});

test("color sin alfajía disponible: línea de error, el ítem no se puede agregar", () => {
  const r = ventana("744", "Sistema744::XX", { alfajia: true, colorPerfileria: "crudo" });
  assert.equal(r.hayErrores, true);
  assert.ok(r.items.some((l) => l.error && l.codigo === "ALFAJIA"));
});

// ─── Medidas libres ─────────────────────────────────────────────────────────

test("medidas libres: cobra la recomendada por el ancho", () => {
  const r = ventana("744", null, { alfajia: true });
  const l = lineas(r, "ALF0111");
  assert.equal(l.length, 1);
  assert.equal(l[0].cantidad, 1.5);
});

test("medidas libres con sillar alfajía: no cobra también el sillar normal", () => {
  const conAlfajia = ventana("5020", null, { alfajia: true, alfajiaCodigo: "SIA0102" });
  assert.equal(lineas(conAlfajia, "SIA0102").length, 1);
  assert.equal(lineas(conAlfajia, "SIL0104").length, 0);
  const sinAlfajia = ventana("5020", null);
  assert.equal(lineas(sinAlfajia, "SIL0104").length, 1);
});

// ─── Descripción comercial ──────────────────────────────────────────────────

test("el PDF nombra la alfajía cobrada y calla la que no se pudo cobrar", () => {
  assert.equal(nombreAlfajia({ alfajia: true, sistema: "744", colorPerfileria: "mate" }), "alfajía 1123");
  assert.equal(nombreAlfajia({ alfajia: true, sistema: "5020", colorPerfileria: "mate", alfajiaCodigo: "SIA0102" }), "sillar alfajía 581");
  assert.equal(nombreAlfajia({ alfajia: true, sistema: "744", colorPerfileria: "crudo" }), null);
  assert.equal(nombreAlfajia({ alfajia: false }), null);
});

// ─── SAP ────────────────────────────────────────────────────────────────────

test("la alfajía llega a la SAP como perfil con cortes", () => {
  const r = ventana("744", "Sistema744::XX", { alfajia: true });
  const { filas } = itemsParaSap([{
    moduloId: "ventanas",
    cantidadPiezas: 1,
    aptoParaCorte: true,
    input: { alfajia: true, sistema: "744", colorPerfileria: "mate" },
    resultado: r as never,
  }]);
  const fila = filas.find((f) => f.codigo === "ALF0111");
  assert.ok(fila, `debe haber fila de SAP para la alfajía; filas: ${filas.map((f) => f.codigo).join(", ")}`);
  assert.equal(fila!.tipo, "perfil");
});
