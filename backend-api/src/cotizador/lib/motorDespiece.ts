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
// DOS FORMAS DE CALCULAR UNA MEDIDA, Y POR QUÉ IMPORTA CUÁL SE USA
// El software de origen no calcula con una recta: calcula
// `trunc((ancho - k) / nº de paneles)`. La extracción original sólo tomó 3
// medidas por diseño, todas múltiplos de 100, así que esa división caía exacta y
// el truncamiento nunca se hizo visible; la regresión lo absorbió desplazando la
// pendiente (donde el modelo real es 1/3 = 0,3333…, la recta quedó en 0,334).
// Ese desplazamiento es un error que CRECE con el tamaño del vano.
//
// Desde 2026-09-13 cada pieza lleva, además de la recta, el `modelo` entero
// reconstruido a partir de esas mismas observaciones (ver
// scripts/2026-09-13_reconstruir_modelos_corte.ts). El motor usa el modelo
// cuando existe y cae a la recta cuando no — hoy 8 perfiles de 983 no admiten
// modelo entero.
//
// QUÉ SIGNIFICA EL `nivelCorte` DE CADA PIEZA
//   A -> el modelo entero está determinado: todos los que reproducen las
//        observaciones dan el mismo número.
//   B -> hay varios modelos compatibles y difieren como mucho en 1 mm.
//   C -> no hay modelo entero; sigue con la recta y su error no está acotado.
//
// LÍMITE IMPORTANTE — leer antes de usar esto para cortar material:
// el nivel habla de la ARITMÉTICA del software de origen, no del taller. Nivel A
// significa "esta cuenta está determinada", no "ésta es la medida a la que hay
// que cortar": el margen de corte de cada perfil se calibra aparte contra piezas
// reales (cotizador.calibracion_margen) y sigue sin medir. Para COTIZAR
// cualquier nivel sirve — un milímetro no mueve el precio. Para CORTAR (sobre
// todo vidrio templado, que es irreversible) el nivel es una condición de ocho:
// las decide `aptitudOrden.ts`, no este archivo. Por eso `calcularDespiece`
// devuelve `aptoParaCorte` y `advertencias` y nunca manda nada a producción por
// su cuenta.
import { lineaCatalogo, round2 } from "./motorCalculo";
import { getProducto } from "./catalogo";
import { margenEfectivo } from "./calibracion";
import { getMargenes } from "../store/calibracionStore";
import * as cache from "../cache";
import type { Diseno, DisenoResumen, Formula, ModeloCorte, OperacionCorte } from "../tipos";

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

const OPS_CORTE: Record<OperacionCorte, (x: number) => number> = {
  exacto: (x) => x,
  trunc: (x) => Math.floor(x),
  round: (x) => Math.round(x),
  ceil: (x) => Math.ceil(x),
};

/**
 * Medida de una pieza. Usa el modelo entero si la pieza lo tiene; si no, la
 * recta ajustada.
 *
 * Un `op` que no esté en OPS_CORTE (columna editada a mano en la base, valor de
 * una versión futura) devuelve `null` en vez de NaN: el llamador ya sabe tratar
 * "sin fórmula utilizable" como una advertencia visible, mientras que un NaN se
 * propagaría hasta el corte y produciría una medida vacía sin que nadie se
 * entere. Es la misma regla del módulo: nunca un cero ni un hueco en silencio.
 */
function evaluar(
  formula: Formula | null | undefined,
  modelo: ModeloCorte | null | undefined,
  anchoMm: number,
  altoMm: number
): number | null {
  if (modelo) {
    const op = OPS_CORTE[modelo.op];
    if (!op || !modelo.n) return null;
    return op((modelo.p * anchoMm + modelo.q * altoMm + modelo.r) / modelo.n);
  }
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

  // Incertidumbre de ESTE despiece, recogida pieza a pieza mientras se calcula.
  // Se nombran las piezas concretas en vez de emitir un veredicto sobre el
  // diseño entero: un diseño donde seis de siete perfiles son exactos y sólo el
  // horizontal divide entre 3 no es "un diseño dudoso", es un diseño con una
  // pieza dudosa — y quien corta necesita saber cuál.
  const piezasConDuda: Array<{ nombre: string; mm: number }> = [];
  const piezasSinModelo: string[] = [];
  // Piezas cuya medida no cambia con el tamaño de la ventana. El modelo las
  // reproduce exactamente (son constantes en el origen), pero una pieza que no
  // escala delata que al despiece le falta un dato de entrada — no es un
  // problema de precisión, y por eso se avisa aparte en vez de degradar el nivel.
  const piezasConstantes: string[] = [];

  // --- Perfiles -----------------------------------------------------------
  for (const p of diseno.perfiles) {
    // La alfajía es opcional y su código lo pone el módulo (Templex vende para
    // cada sistema una referencia distinta de la que trae el diseño extraído).
    if (p.esAlfajia && !incluirAlfajia) continue;

    const medidaMm = evaluar(p.formula, p.modelo, anchoMm, altoMm);
    const nombrePieza = `${p.descripcion ?? "perfil"} (${p.ref})`;
    if (!p.modelo) piezasSinModelo.push(nombrePieza);
    else {
      if (p.modelo.dispersionMm > 0) {
        piezasConDuda.push({ nombre: nombrePieza, mm: p.modelo.dispersionMm });
      }
      if (p.modelo.p === 0 && p.modelo.q === 0) piezasConstantes.push(nombrePieza);
    }

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
      // Cota de incertidumbre de la cuenta, para que la orden de corte pueda
      // decir "±1 mm" en la pieza que lo tiene en vez de callarlo.
      incertidumbreMm: p.modelo ? p.modelo.dispersionMm : null,
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
    const anchoV = evaluar(v.formulaAncho, v.modeloAncho, anchoMm, altoMm);
    const altoV = evaluar(v.formulaAlto, v.modeloAlto, anchoMm, altoMm);

    const nombreV = v.descripcion && !/sin vidrio/i.test(v.descripcion) ? v.descripcion : "paño de vidrio";
    if (!v.modeloAncho || !v.modeloAlto) piezasSinModelo.push(nombreV);
    else {
      const dudaV = Math.max(v.modeloAncho.dispersionMm, v.modeloAlto.dispersionMm);
      if (dudaV > 0) piezasConDuda.push({ nombre: nombreV, mm: dudaV });
    }

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
      incertidumbreMm:
        v.modeloAncho && v.modeloAlto
          ? Math.max(v.modeloAncho.dispersionMm, v.modeloAlto.dispersionMm)
          : null,
    });
  }

  if (codigoVidrio && areaTotalM2 > 0) {
    items.push(lineaCatalogo(codigoVidrio, areaTotalM2, segmentoCliente));
  }

  // --- Aptitud para corte -------------------------------------------------
  //
  // NIVELES ACEPTADOS: A y B, por decisión explícita del usuario (2026-09-19).
  //
  // El nivel B significa "los modelos candidatos de esta pieza coinciden entre
  // sí dentro de 1 mm": la fórmula no está cerrada del todo, pero su error está
  // ACOTADO en 1 mm. Con la holgura de instalación configurada en 3 mm, ese
  // milímetro cabe dentro de la tolerancia, y el usuario lo dio por indiferente
  // tanto en aluminio como en vidrio.
  //
  // El nivel C NO se acepta, y la diferencia no es de grado: ahí el error CRECE
  // con el tamaño del vano (hasta 3,3 mm medidos, sin tope superior) porque la
  // pieza se sigue calculando con la recta ajustada en vez de con un modelo
  // entero. Un error acotado se absorbe con holgura; uno que se agranda con la
  // ventana, no.
  //
  // Para revertir: quitar "B" de este Set. Es el único punto que decide esto en
  // el motor; `aptitudOrden.ts` lee el resultado, no lo recalcula.
  const NIVELES_APTOS_PARA_CORTE = new Set(["A", "B"]);
  const hayMedidasInvalidas = items.some((it) => it.error);
  const aptoParaCorte =
    NIVELES_APTOS_PARA_CORTE.has(diseno.nivelCorte ?? "") && !hayMedidasInvalidas;

  // Las piezas sin modelo entero son las únicas con error no acotado: siguen
  // calculándose con la recta ajustada, que se desvía más cuanto más grande es
  // el vano. Se nombran una a una porque son pocas y son las que de verdad
  // frenan una orden de corte.
  if (piezasSinModelo.length > 0) {
    advertencias.push(
      `Estas piezas todavía se calculan con la fórmula aproximada y su desviación no está acotada: ` +
        `${piezasSinModelo.join(", ")}. Sirven para cotizar; no las uses para cortar sin medir una pieza real.`
    );
  }
  // Una medida que no cambia al cambiar el vano no es un error de precisión: el
  // software de origen la devuelve así de verdad. Lo que indica es que ese diseño
  // se calcula con un parámetro que este formulario no pregunta (en los casos
  // reales, el ancho del marco de los diseños "M"). La medida sale exacta y el
  // precio es correcto, pero no sirve para cortar esa pieza.
  if (piezasConstantes.length > 0) {
    advertencias.push(
      `Estas piezas dan siempre la misma medida sin importar el tamaño de la ventana: ` +
        `${piezasConstantes.join(", ")}. Este diseño se calcula con un dato que el formulario todavía ` +
        `no pide, así que esa medida no sirve para cortar — el resto del despiece sí.`
    );
  }
  if (piezasConDuda.length > 0) {
    const peor = Math.max(...piezasConDuda.map((p) => p.mm));
    const nombres = piezasConDuda.map((p) => p.nombre).join(", ");
    advertencias.push(
      `Hay ${piezasConDuda.length} pieza(s) cuya medida sale de una división y puede variar ±${peor} mm: ` +
        `${nombres}. El resto del despiece está determinado. Para cerrar ese milímetro hace falta medir ` +
        `una pieza real de esas y registrarla en la calibración.`
    );
  }
  if (huboMargen) {
    advertencias.push(
      "Algunas medidas llevan aplicado el margen que se calibró con el taller. En la orden de " +
        "corte aparece la medida final; la medida sin margen queda guardada aparte para poder " +
        "seguir contrastándola."
    );
  }
  // Antes había aquí una advertencia que salía en el 93% de los diseños: "las
  // fórmulas se ajustaron con 3 medidas y tienen 3 incógnitas, así que todavía
  // no están validadas". Describía el ajuste por regresión, que ya no es cómo se
  // calcula: el modelo entero se deriva de esas mismas 3 observaciones pero no
  // tiene incógnitas continuas que ajustar, y lo que queda de ambigüedad se
  // reporta arriba, pieza por pieza y con su cota en milímetros. Repetirla sería
  // avisar dos veces de lo mismo, y en términos que ya no corresponden al
  // cálculo. `medidasRespaldo` se conserva en el catálogo como dato de
  // procedencia; no genera advertencia por sí solo.

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
