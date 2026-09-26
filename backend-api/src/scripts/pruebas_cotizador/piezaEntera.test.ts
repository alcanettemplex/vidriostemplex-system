// Piezas por unidad y los 18 diseños desbloqueados el 2026-09-25
// (scripts `2026-09-25_cotizador_platina_511_y_tubo_inox.ts` y `..._tubular_torino_kik0301.ts`).
//
// - `511` Retícula = platina P-30 (P300101 mate / P300301 crudo / P300601
//   negro), cobrada por metro como cualquier perfil.
// - `ROD1PULG` = TUB0316, tubo inox de 1.800 mm que "no se vende fraccionado":
//   cada corte consume ceil(medida / 1800) tubos, sin desperdicio.
// - `REC30X10` = KIK0301, kit tubo rectangular "todo en uno" (trae las
//   rodachinas): UND sin largo de pieza → 1 kit por corte, cualquier ancho.
//
// Precarga la caché (abre conexión): correrla con el backend dev abajo, o sola
// — ver "Bajar el backend dev antes de correrlas" en docs/modulos/cotizador.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { sequelize } from "../../models";
import * as cache from "../../cotizador/cache";
import { getProducto, getPrecio } from "../../cotizador/lib/catalogo";
import { calcularDespiece, listarDisenos } from "../../cotizador/lib/motorDespiece";
import { calcularItem } from "../../cotizador/modules/registry";
import { generarPerfileriaSAP } from "../../cotizador/lib/generadorSapPerfileria";
import type { CortePerfil } from "../../cotizador/tipos";

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

const DISENOS_RETICULA = [
  "Sistema5020::XX_RETICULA2",
  "Sistema744::OXXO_RETICULA",
  "Sistema744::XX_RETICULA",
  "Sistema744::XX_RETICULA_2x5",
  "Sistema744::XXX_3P_RETICULA",
  "Sistema8025::OX_RETICULA",
  "Sistema8025::XX_RETICULA",
  "Sistema8025::XXX_RETICULA",
];
const DISENOS_TUBO = [
  "Cabina Batiente::PP_PLEGABLE_RODAMIENTO",
  "Cabina Deslizante Primavera::OX_PRIMAVERA",
  "Cabina Deslizante Primavera::XO_PRIMAVERA",
  "Cabina Deslizante Primavera::OXO_PRIMAVERA",
  "Cabina Deslizante Primavera::OXXO_PRIMAVERA",
];
const DISENOS_TORINO = [
  "Cabina Deslizante Torino::OX_TORINO",
  "Cabina Deslizante Torino::XO_TORINO",
  "Cabina Deslizante Torino::OXO_TORINO",
  "Cabina Deslizante Torino::OXXO_TORINO",
  "Cabina Deslizante Torino::OXXO_FACHADA_TORINO",
];

type Linea = { codigo: string; cantidad: number; unidad: string; valorTotal: number; error?: boolean };

/** Líneas de un código en el BOM de un despiece o de un ítem. */
function lineasDe(r: { items: unknown }, codigo: string): Linea[] {
  return (r.items as Linea[]).filter((l) => l.codigo === codigo);
}
function lineasTubo(r: ReturnType<typeof calcularDespiece>) {
  return lineasDe(r, "TUB0316");
}

test("el catálogo trae el largo de pieza solo en TUB0316", () => {
  assert.equal(getProducto("TUB0316")?.largoPiezaMm, 1800);
  assert.equal(getProducto("TUB0316")?.unidad, "UND");
  for (const codigo of ["P300101", "P300301", "P300601", "CL4MM01CR"]) {
    const p = getProducto(codigo);
    assert.ok(p, `${codigo} debería existir`);
    // Ausente, no null: el golden master compara las claves del producto.
    assert.equal("largoPiezaMm" in p!, false, `${codigo} no debería traer largoPiezaMm`);
  }
});

test("los 18 diseños desbloqueados son cotizables y despiezan sin líneas en error", () => {
  const cotizables = new Set(listarDisenos({ soloCotizables: true }).map((d) => d.id));
  assert.equal(cotizables.size, 163, "desde el 2026-09-25 no queda ningún diseño bloqueado");
  for (const id of [...DISENOS_RETICULA, ...DISENOS_TUBO, ...DISENOS_TORINO]) {
    assert.ok(cotizables.has(id), `${id} debería ser cotizable`);
    const r = calcularDespiece({ disenoId: id, anchoCm: 150, altoCm: 120, colorPerfileria: "mate" });
    const errores = (r.items as Array<{ error?: boolean; descripcion: string }>).filter((l) => l.error);
    assert.deepEqual(errores.map((e) => e.descripcion), [], `${id} tiene líneas en error`);
  }
});

test("un tubo por corte hasta 1.800 mm, dos de 1.801 a 3.600, tres desde 3.601", () => {
  const casos: Array<[number, number]> = [
    [150, 1],
    [180, 1],
    [180.1, 2],
    [360, 2],
    [360.1, 3],
  ];
  for (const [anchoCm, tubos] of casos) {
    const r = calcularDespiece({ disenoId: "Cabina Deslizante Primavera::OX_PRIMAVERA", anchoCm, altoCm: 190 });
    const [linea] = lineasTubo(r);
    assert.ok(linea, `a ${anchoCm * 10} mm debería haber línea de TUB0316`);
    assert.equal(linea.cantidad, tubos, `a ${anchoCm * 10} mm`);
    assert.equal(linea.unidad, "UND");
    // Sin desperdicio: el precio es tubos × precio del tubo, exacto.
    assert.equal(linea.valorTotal, Math.round(tubos * getPrecio("TUB0316", "PA")! * 100) / 100);
  }
});

test("un diseño con dos cortes de tubo cobra los tubos de cada corte por separado", () => {
  // OXXO_PRIMAVERA lleva dos renglones ROD1PULG: a 2.000 mm son 2 tubos cada uno.
  const r = calcularDespiece({ disenoId: "Cabina Deslizante Primavera::OXXO_PRIMAVERA", anchoCm: 200, altoCm: 190 });
  const total = lineasTubo(r).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(total, 4);
});

test("el corte del tubo lleva el largo de pieza y los demás perfiles no", () => {
  const r = calcularDespiece({ disenoId: "Cabina Deslizante Primavera::OX_PRIMAVERA", anchoCm: 150, altoCm: 190 });
  const cortes = r.cortes.perfiles as CortePerfil[];
  const tubo = cortes.find((c) => c.codigo === "TUB0316");
  assert.equal(tubo?.largoPiezaMm, 1800);
  assert.equal(tubo?.piezasEnteras, 1);
  assert.equal(tubo?.medidaMm, 1500, "el corte real sigue siendo la medida, no el largo del tubo");
  for (const c of cortes.filter((c) => c.codigo !== "TUB0316")) {
    assert.equal("largoPiezaMm" in c, false, `${c.ref} no debería traer largoPiezaMm`);
    assert.equal("piezasEnteras" in c, false, `${c.ref} se cobra por metro: no lleva piezasEnteras`);
  }
});

test("el kit del tubular Torino es 1 por riel, a cualquier ancho", () => {
  for (const anchoCm of [120, 300]) {
    const r = calcularDespiece({ disenoId: "Cabina Deslizante Torino::OX_TORINO", anchoCm, altoCm: 190 });
    const [kit] = lineasDe(r, "KIK0301");
    assert.equal(kit?.cantidad, 1, `a ${anchoCm * 10} mm`);
    assert.equal(kit?.unidad, "UND");
    assert.equal(kit?.valorTotal, getPrecio("KIK0301", "PA"));
    const corte = (r.cortes.perfiles as CortePerfil[]).find((c) => c.codigo === "KIK0301");
    assert.equal(corte?.piezasEnteras, 1);
    assert.equal("largoPiezaMm" in corte!, false, "el kit no tiene largo de pieza");
  }
  const oxxo = calcularDespiece({ disenoId: "Cabina Deslizante Torino::OXXO_TORINO", anchoCm: 250, altoCm: 190 });
  assert.equal(lineasDe(oxxo, "KIK0301").reduce((s, l) => s + l.cantidad, 0), 2, "OXXO lleva dos rieles");
});

test("el kit KIK0301 trae las rodachinas: no se suman ROD0401, por diseño ni por medidas libres", () => {
  const base = { anchoCm: 150, altoCm: 190, espesorVidrioMm: 8, segmentoCliente: "PA", cantidadPiezas: 1 };
  const torino = calcularItem("cabinas-corredizas", {
    ...base, disenoId: "Cabina Deslizante Torino::OX_TORINO", tipoSistema: "tubo_rectangular",
  } as never) as { items: Linea[]; hayErrores: boolean };
  assert.equal(torino.hayErrores, false);
  assert.equal(lineasDe(torino, "KIK0301").length, 1);
  assert.equal(lineasDe(torino, "ROD0401").length, 0);

  const libreTubo = calcularItem("cabinas-corredizas", { ...base, tipoSistema: "tubo_rectangular" } as never) as {
    items: Linea[];
  };
  assert.equal(lineasDe(libreTubo, "KIK0301")[0]?.cantidad, 1);
  assert.equal(lineasDe(libreTubo, "ROD0401").length, 0);

  // Regresión: los demás sistemas y diseños siguen cobrando sus 4 rodachinas.
  const libreCorrediza = calcularItem("cabinas-corredizas", { ...base, tipoSistema: "corrediza" } as never) as {
    items: Linea[];
  };
  assert.equal(lineasDe(libreCorrediza, "ROD0401")[0]?.cantidad, 4);
  const primavera = calcularItem("cabinas-corredizas", {
    ...base, disenoId: "Cabina Deslizante Primavera::OX_PRIMAVERA", tipoSistema: "corrediza",
  } as never) as { items: Linea[] };
  assert.equal(lineasDe(primavera, "ROD0401")[0]?.cantidad, 4);
});

test("el kit Glasvit KDG0306 también viene completo: no se suman ROD0401 (2026-09-26)", () => {
  const glasvit = calcularItem("cabinas-corredizas", {
    anchoCm: 130, altoCm: 190, espesorVidrioMm: 8, segmentoCliente: "PA", cantidadPiezas: 1, tipoSistema: "glasvit",
  } as never) as { items: Linea[]; hayErrores: boolean };
  assert.equal(glasvit.hayErrores, false);
  assert.equal(lineasDe(glasvit, "KDG0306")[0]?.cantidad, 1);
  assert.equal(lineasDe(glasvit, "ROD0401").length, 0);
});

test("la SAP pide tubos, no barras de 6 m", () => {
  // Dos ítems: 2.000 mm (2 tubos) y 1.500 mm (1 tubo) = 3 tubos. Por metros
  // habría pedido ceil(3,5 × 1,05 / 6) = 1 "barra" de un perfil que no existe en 6 m.
  const items = [200, 150].map((anchoCm) => ({
    resultado: calcularDespiece({ disenoId: "Cabina Deslizante Primavera::OX_PRIMAVERA", anchoCm, altoCm: 190 }),
  }));
  const { filas } = generarPerfileriaSAP(items as never);
  const fila = filas.find((f) => f.codigo === "TUB0316");
  assert.equal(fila?.cantidad, 3);
  assert.equal(fila?.dimension, "1-2000/ 1-1500");

  // El kit: 1 por riel aunque el riel mida 6.000 mm (por metros habrían sido
  // 6,3 m con desperdicio → 2 "barras" de un kit que se compra entero).
  const kit = generarPerfileriaSAP([
    { resultado: calcularDespiece({ disenoId: "Cabina Deslizante Torino::OX_TORINO", anchoCm: 600, altoCm: 190 }) },
  ] as never).filas.find((f) => f.codigo === "KIK0301");
  assert.equal(kit?.cantidad, 1);
});

test("la retícula usa la platina del color, y cae a mate con aviso donde no existe", () => {
  const id = "Sistema744::XX_RETICULA";
  const negro = calcularDespiece({ disenoId: id, anchoCm: 150, altoCm: 120, colorPerfileria: "negro" });
  const codigosNegro = (negro.items as Array<{ codigo: string }>).map((l) => l.codigo);
  assert.ok(codigosNegro.includes("P300601"));

  const blanco = calcularDespiece({ disenoId: id, anchoCm: 150, altoCm: 120, colorPerfileria: "blanco" });
  const codigosBlanco = (blanco.items as Array<{ codigo: string }>).map((l) => l.codigo);
  assert.ok(codigosBlanco.includes("P300101"), "sin platina blanca, se cotiza la mate");
  assert.ok(
    blanco.advertencias.some((a: string) => a.includes("511") && a.includes("mate")),
    "el cambio de acabado se avisa"
  );
});
