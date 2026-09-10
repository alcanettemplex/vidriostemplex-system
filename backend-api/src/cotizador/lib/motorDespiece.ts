// Motor de despiece por DISEÑO.
//
// A diferencia de los motores por módulo (modules/*.js), que estiman el consumo
// de material con reglas generalizadas a partir del Excel original, este motor
// calcula la medida de corte REAL de cada pieza aplicando las fórmulas extraídas
// del software de diseño: para cada perfil y cada paño de vidrio,
//
//     medida_mm = a * anchoMm + b * altoMm + c
//
// El catálogo de diseños vive en data/disenos.json (generado aparte) y trae, por
// cada diseño, sus perfiles con fórmula y el código de catálogo Templex que le
// corresponde a cada color.
//
// LÍMITE IMPORTANTE — leer antes de usar esto para cortar material:
// las fórmulas se ajustaron sobre 3 medidas por diseño con 3 incógnitas, así que
// reproducen sus muestras por construcción y NO están validadas. Cada diseño
// lleva un `nivelCorte`:
//
//   A -> coeficientes enteros; la medida siempre cae en milímetro exacto.
//   B -> hay una división (mitades, cuartos) cuyo modo de redondeo se desconoce;
//        el error puede llegar a ~0.8 mm.
//   C -> el modelo lineal es demostrablemente falso para ese diseño (esconde una
//        división entera o un recorte a cero); puede desviarse hasta ~3.3 mm.
//
// Para COTIZAR, cualquier nivel sirve: unos milímetros no mueven el precio.
// Para CORTAR (sobre todo vidrio templado, que es irreversible) sólo el nivel A
// es defendible hoy, y aun ése debería pasar por la calibración contra taller.
// Por eso `calcularDespiece` devuelve `aptoParaCorte` y `advertencias`, y nunca
// decide por su cuenta que un despiece se puede mandar a producción.
import { lineaCatalogo, round2 } from "./motorCalculo";
import { getProducto } from "./catalogo";
import { margenEfectivo } from "./calibracion";
import { getMargenes } from "../store/calibracionStore";
import * as cache from "../cache";
import type { Diseno, DisenoResumen } from "../tipos";

// Los diseños ya no se leen de disco: vienen de la caché en memoria, que los
// reconstruye desde Postgres al arrancar con exactamente la misma forma que
// tenía disenos.json. El original los cargaba a nivel de módulo con
// readFileSync; aquí se piden por getter para que una recarga de la caché se
// vea sin reiniciar el proceso.

/** Diseños disponibles, opcionalmente filtrados por módulo. `soloCotizables`
 * deja fuera los que tienen algún perfil sin precio en el catálogo. */
export function listarDisenos({
  modulo,
  soloCotizables = true,
}: { modulo?: string; soloCotizables?: boolean } = {}): DisenoResumen[] {
  let lista = cache.getDisenos();
  if (modulo) lista = lista.filter((d) => d.modulo === modulo);
  if (soloCotizables) lista = lista.filter((d) => d.cotizable);
  return lista.map((d) => ({
    id: d.id,
    modulo: d.modulo,
    sistema: d.sistema,
    diseno: d.diseno,
    etiqueta: d.etiqueta,
    paneles: d.paneles,
    nivelCorte: d.nivelCorte,
    aptoParaCorte: d.nivelCorte === "A",
    piezasPerfil: d.perfiles.length,
    panosVidrio: d.vidrios.length,
  }));
}

export function getDiseno(id: string): Diseno | null {
  return cache.getDiseno(id);
}

/** Normaliza el color de perfilería al formato usado en `codigosPorColor`
 * ("gris plata" -> "GRISPLATA"). */
function claveColor(color: unknown): string {
  return String(color ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}

function evaluar(
  formula: { a: number; b: number; c: number } | null | undefined,
  anchoMm: number,
  altoMm: number
): number | null {
  if (!formula) return null;
  return formula.a * anchoMm + formula.b * altoMm + formula.c;
}

/**
 * Calcula el despiece de un diseño a una medida concreta.
 *
 * @param {Object} opts
 * @param {string} opts.disenoId      - id del catálogo de diseños
 * @param {number} opts.anchoCm       - ancho total en centímetros (convención de la app)
 * @param {number} opts.altoCm        - alto total en centímetros
 * @param {string} opts.colorPerfileria
 * @param {string} opts.codigoVidrio  - código de catálogo del vidrio elegido por el vendedor
 * @param {string} opts.segmentoCliente
 * @returns {{items: Array, cortes: Object, advertencias: string[], aptoParaCorte: boolean}}
 */
export interface ParamsCalcularDespiece {
  /** Id del catálogo de diseños. */
  disenoId: string;
  /** Ancho total en centímetros (convención de la app). */
  anchoCm: number;
  /** Alto total en centímetros. */
  altoCm: number;
  colorPerfileria?: string;
  /** Código de catálogo del vidrio elegido por el vendedor. */
  codigoVidrio?: string;
  segmentoCliente?: string;
  incluirAlfajia?: boolean;
}

export function calcularDespiece({
  disenoId,
  anchoCm,
  altoCm,
  colorPerfileria = "mate",
  codigoVidrio,
  segmentoCliente = "PA",
  incluirAlfajia = false,
}: ParamsCalcularDespiece) {
  const diseno = getDiseno(disenoId);
  if (!diseno) {
    return {
      items: [],
      cortes: { perfiles: [], vidrios: [] },
      advertencias: [`El diseño "${disenoId}" no existe en el catálogo de diseños.`],
      aptoParaCorte: false,
      error: true,
    };
  }

  const advertencias: string[] = [];
  const anchoMm = anchoCm * 10;
  const altoMm = altoCm * 10;
  const color = claveColor(colorPerfileria);

  // Márgenes aprobados en la calibración. Cada corte se emite en dos versiones:
  // `medidaMm` es la que va al taller (con el margen aplicado) y `medidaBrutaMm`
  // la que sale de la fórmula pura. La bruta es la que debe registrar un
  // contraste: si se contrastara la corregida, la diferencia tendería a cero en
  // cuanto se aprobara un margen y la calibración se validaría a sí misma.
  const margenes = getMargenes();
  let huboMargen = false;

  const items = [];
  const cortesPerfil = [];
  const cortesVidrio = [];

  // --- Perfiles -----------------------------------------------------------
  for (const p of diseno.perfiles) {
    // La alfajía es opcional y su código lo pone el módulo (Templex vende para
    // cada sistema una referencia distinta de la que trae el diseño extraído).
    if (p.esAlfajia && !incluirAlfajia) continue;

    const medidaMm = evaluar(p.formula, anchoMm, altoMm);

    if (medidaMm === null || !Number.isFinite(medidaMm)) {
      advertencias.push(`El perfil ${p.ref} (${p.descripcion}) no tiene fórmula utilizable.`);
      continue;
    }
    if (medidaMm <= 0) {
      // Señal de que el diseño necesita un parámetro que no se está pidiendo
      // (alto de cada cuerpo apilado, ancho del paño fijo...). No se inventa.
      advertencias.push(
        `El perfil ${p.ref} (${p.descripcion}) da una medida de ${Math.round(medidaMm)} mm a esta ` +
          `dimensión. Este diseño necesita un dato adicional que el formulario todavía no pide: ` +
          `no uses este despiece para cortar.`
      );
      items.push({
        codigo: p.ref,
        descripcion: `${p.descripcion} — medida inválida (${Math.round(medidaMm)} mm)`,
        categoria: "ERROR",
        unidad: "X METRO",
        cantidad: p.cantidad,
        precioUnitario: 0,
        valorTotal: 0,
        error: true,
      });
      continue;
    }

    // Color exacto si existe. Si no, se usa otro acabado disponible en vez de
    // dejar la línea sin precio: pasa sobre todo en cabinas y espejos, donde el
    // formulario no pide color de perfilería y se asume "mate" por defecto. El
    // cambio nunca es silencioso — queda dicho en las advertencias, porque el
    // precio del perfil sí varía entre acabados.
    let codigo = p.codigosPorColor?.[color] ?? null;
    if (!codigo && p.codigosPorColor) {
      const [colorAlterno, codigoAlterno] = Object.entries(p.codigosPorColor)[0] ?? [];
      if (codigoAlterno) {
        codigo = codigoAlterno;
        advertencias.push(
          `El perfil ${p.ref} (${p.descripcion}) no existe en color ${colorPerfileria}: se cotizó en ` +
            `${colorAlterno.toLowerCase()}, que sí está en el catálogo. Verifica el acabado antes de confirmar.`
        );
      }
    }
    // Margen aprobado en la calibración para esta pieza, si el taller ya la midió.
    const cal = margenEfectivo(margenes, { sistema: diseno.sistema, material: "aluminio", ref: p.ref });
    const medidaFinalMm = medidaMm + cal.margenMm;
    if (cal.margenMm !== 0) huboMargen = true;

    // Metros lineales a comprar: medida de una pieza × nº de piezas, más desperdicio.
    const metrosNetos = (medidaFinalMm / 1000) * p.cantidad;
    const metrosConDesperdicio = metrosNetos * (1 + (p.desperdicioPct ?? 0) / 100);

    cortesPerfil.push({
      ref: p.ref,
      descripcion: p.descripcion,
      medidaMm: Math.round(medidaFinalMm * 100) / 100,
      // La medida sin margen es la que hay que contrastar contra el maestro.
      medidaBrutaMm: Math.round(medidaMm * 100) / 100,
      margenMm: cal.margenMm,
      origenMargen: cal.origen,
      nivelCorte: p.nivelCorte ?? null,
      cantidad: p.cantidad,
      metrosNetos: round2(metrosNetos),
    });

    if (!codigo) {
      items.push({
        codigo: p.ref,
        descripcion: `${p.descripcion} (ref ${p.ref}) sin precio en color ${colorPerfileria}`,
        categoria: "ERROR",
        unidad: "X METRO",
        cantidad: round2(metrosConDesperdicio),
        precioUnitario: 0,
        valorTotal: 0,
        error: true,
      });
      continue;
    }
    items.push(lineaCatalogo(codigo, metrosConDesperdicio, segmentoCliente));
  }

  // --- Vidrios ------------------------------------------------------------
  // Las fórmulas dan el TAMAÑO de cada paño; el precio sale del vidrio que el
  // vendedor eligió (se cobra por m²), no del vidrio que traía el diseño.
  let areaTotalM2 = 0;
  for (const v of diseno.vidrios) {
    const anchoV = evaluar(v.formulaAncho, anchoMm, altoMm);
    const altoV = evaluar(v.formulaAlto, anchoMm, altoMm);

    if (anchoV === null || altoV === null) {
      advertencias.push(`El paño de vidrio "${v.descripcion}" no tiene fórmula de tamaño utilizable.`);
      continue;
    }
    if (anchoV <= 0 || altoV <= 0) {
      advertencias.push(
        `Un paño de vidrio da ${Math.round(anchoV)} × ${Math.round(altoV)} mm a esta dimensión. ` +
          `Este diseño necesita un dato adicional que el formulario todavía no pide.`
      );
      continue;
    }

    const areaPano = (anchoV / 1000) * (altoV / 1000);
    const areaConDesperdicio = areaPano * v.cantidad * (1 + (v.desperdicioPct ?? 0) / 100);
    areaTotalM2 += areaConDesperdicio;

    // El diseño extraído trae el vidrio con el que se hizo la extracción (a veces
    // literalmente "Sin Vidrio"). Lo que va al templador es el vidrio que eligió
    // el vendedor, así que es ese el que se nombra en el corte.
    const vidrioElegido = codigoVidrio ? getProducto(codigoVidrio) : null;
    const nombrePano =
      vidrioElegido?.descripcion ||
      (v.descripcion && !/sin vidrio/i.test(v.descripcion) ? v.descripcion : null);

    cortesVidrio.push({
      descripcion: nombrePano,
      anchoMm: Math.round(anchoV * 100) / 100,
      altoMm: Math.round(altoV * 100) / 100,
      cantidad: v.cantidad,
      areaM2: round2(areaPano * v.cantidad),
      nivelRiesgo: v.nivelRiesgo,
    });
  }

  if (codigoVidrio && areaTotalM2 > 0) {
    items.push(lineaCatalogo(codigoVidrio, areaTotalM2, segmentoCliente));
  }

  // --- Aptitud para corte -------------------------------------------------
  const hayMedidasInvalidas = items.some((it) => it.error);
  const aptoParaCorte = diseno.nivelCorte === "A" && !hayMedidasInvalidas;

  if (diseno.nivelCorte === "B") {
    advertencias.push(
      "Las medidas de vidrio de este diseño salen de una división cuyo redondeo no se ha " +
        "verificado: sirven para cotizar, pero pueden desviarse hasta ~0,8 mm. No cortar sin calibrar."
    );
  } else if (diseno.nivelCorte === "C") {
    advertencias.push(
      "El cálculo de vidrio de este diseño usa un modelo lineal que se sabe incorrecto para él " +
        "(esconde una división entera o un recorte): puede desviarse hasta ~3,3 mm. Sirve para " +
        "cotizar; NO usar para cortar."
    );
  }
  if (huboMargen) {
    advertencias.push(
      "Algunas medidas llevan aplicado el margen que se calibró con el taller. En la orden de " +
        "corte aparece la medida final; la medida sin margen queda guardada aparte para poder " +
        "seguir contrastándola."
    );
  }
  if (diseno.medidasRespaldo && diseno.medidasRespaldo <= 3) {
    advertencias.push(
      `Las fórmulas de este diseño se ajustaron con ${diseno.medidasRespaldo} medidas y tienen ` +
        `${diseno.medidasRespaldo} incógnitas, así que todavía no están validadas contra el taller.`
    );
  }

  return {
    diseno: {
      id: diseno.id,
      sistema: diseno.sistema,
      diseno: diseno.diseno,
      etiqueta: diseno.etiqueta,
      paneles: diseno.paneles,
      nivelCorte: diseno.nivelCorte,
    },
    items,
    cortes: { perfiles: cortesPerfil, vidrios: cortesVidrio },
    areaVidrioM2: round2(areaTotalM2),
    aptoParaCorte,
    advertencias,
  };
}
