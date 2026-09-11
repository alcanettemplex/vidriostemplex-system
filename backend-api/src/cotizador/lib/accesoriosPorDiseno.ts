// Accesorios de un DISEÑO a partir del mapeo de negocio (db/mapeo-accesorios.json),
// en vez del mapa hardcodeado propio de cada módulo (CATALOGO_SISTEMAS en
// ventanas.js, las constantes de proyectantes.js/cabinasCorredizas.js/
// cabinasBatientes.js/espejo.js).
//
// POR QUÉ EXISTE ESTE ARCHIVO APARTE:
// disenos.json trae, por cada diseño, un array `accesorios: [{descripcion,
// cantidad, formula}]` que sale directo del extractor del software de origen y que HOY
// no lee ningún módulo (verificado con grep exhaustivo: es dato muerto). Cada
// módulo cobra sus accesorios desde un mapa propio, escrito a mano, que es la
// única fuente que factura algo hoy en producción. Este archivo es la
// INFRAESTRUCTURA para poder cobrar en cambio desde los datos reales del
// diseño — pero es sólo eso, infraestructura: mientras un sistema no esté en
// `sistemasActivos` (raíz de mapeo-accesorios.json), nadie llama a
// `accesoriosPorDiseno` en producción; el día que un sistema se active, quien
// active la llamada será otro código, con un `accesorios: accesoriosPorDiseno`
// explícito en el módulo — este archivo no se auto-conecta a nada.
//
// Las 54 descripciones distintas de accesorio que existen en disenos.json ya
// están clasificadas a mano en mapeo-accesorios.json, en cuatro estados
// (ver ese archivo, es la fuente de verdad de las clasificaciones — este
// archivo NO las re-deriva ni las cambia):
//
//   MAPEADO             -> trae `codigo` (del catálogo real) y `consumo` (cómo
//                          calcular la cantidad). Se convierte en una línea
//                          normal de BOM con lineaCatalogo().
//   INSUMO_NO_FACTURADO -> tornillos, felpa, remaches, anclajes: nunca
//                          tuvieron código de catálogo (cero referencias). Van
//                          dentro del margen, nunca en el precio al cliente;
//                          por eso NO producen línea de BOM, pero sí quedan
//                          disponibles (con su cantidad) en `desgloseAccesorios`
//                          para que el futuro documento de taller los liste.
//   PENDIENTE           -> nadie lo ha decidido todavía. Bloquea con
//                          `error:true`, igual que el resto del proyecto
//                          trata un código inexistente: la regla más
//                          importante de este proyecto es que nunca se cobra
//                          $0 en silencio.
//   IGNORADO            -> decidido que no aplica. No produce nada, sin error.
//
// Una descripción que ni siquiera aparece en el mapeo (no debería pasar con
// las 54 actuales, pero sí puede pasar si el catálogo de diseños se
// regenera con descripciones nuevas) se trata exactamente igual que
// PENDIENTE: bloquear es siempre más seguro que adivinar.
import { lineaCatalogo, round2 } from "./motorCalculo";
import { getProducto } from "./catalogo";
import * as cache from "../cache";
import type { LineaBOM } from "./motorCalculo";
import type {
  ConsumoAccesorio,
  DisenoAccesorio,
  MapeoAccesorio,
  MapeoAccesorios,
} from "../tipos";

/**
 * El mapeo sale de la caché en memoria, que lo carga de
 * `cotizador_mapeo_accesorio` + `cotizador_accesorio_sistema_activo`.
 *
 * El original releía el archivo en CADA llamada, a propósito: se edita desde
 * pantalla y cachearlo habría hecho que un cambio guardado no se viera hasta
 * reiniciar. Aquí ese riesgo no existe porque el controlador que escribe
 * invalida la caché tras el commit, así que la siguiente lectura ya ve el
 * cambio sin reiniciar nada.
 *
 * La escritura (`guardarMapeoAccesorios` en el origen) NO vive aquí: sólo la
 * llamaba la capa de rutas, y se reimplementa asíncrona y en transacción en
 * `cotizador_accesorios.controller.ts`.
 */
export function leerMapeoAccesorios(): MapeoAccesorios {
  return cache.getMapeoAccesorios();
}

/** Los tipos de `consumo.tipo` que sabe calcular esta infraestructura.
 * Si algún día hace falta uno más, se añade aquí Y se documenta abajo en el
 * `switch` de `calcularCantidad` -- no se debe adivinar un tipo no soportado.
 *
 * Los tres últimos (2026-09-11) traducen las fórmulas del Excel matriz del que
 * nació el módulo, que despieza en función de `alasCorredizas` y `cuerpos` --
 * las dos entradas que `cotizarPorDiseno` ya deriva del código del diseño con
 * `parsearCodigo()` y pasa al callback. Se añaden porque leer la cantidad
 * cruda del extractor ("unidad") no reproduce el despiece original: el
 * extractor congela un número por diseño, y varias piezas cambian con la
 * geometría (las guías de 744/8025 son 2 por ala, el elevador de tablero son 4
 * o 6 según el ancho).
 *
 * NO se añadió un tipo para la fórmula de empaque del Excel
 * ("2×ancho + 2×alto×cuerpos"): desarrollada, ésa es exactamente la suma de
 * los perímetros de los paños, que `perimetroVidrio` ya calcula -- y mejor,
 * porque parte del despiece real y no de la medida nominal. Duplicarla sería
 * código muerto con dos verdades. */
export const TIPOS_CONSUMO_SOPORTADOS = [
  "unidad",
  "perimetroVidrio",
  "perimetroMarco",
  "altoPorHoja",
  "porAlasCorredizas",
  "porCuerpos",
  "porAnchoEscalonado",
];

/**
 * Calcula la cantidad de UN accesorio MAPEADO a partir de su `consumo` y del
 * contexto de la cotización. Nunca inventa un número: si no puede calcular
 * una cantidad de verdad, devuelve `ok:false` con el motivo, para que el
 * llamador lo trate como error en vez de cobrar (o de omitir) algo a ciegas.
 *
 * @returns {{ok: true, cantidad: number} | {ok: false, motivo: string}}
 */
/** Contexto de la pieza que necesitan los cálculos de consumo. Es un
 * subconjunto del que arma cotizarPorDiseno. */
/**
 * ¿Este mapeo aplica al sistema del diseño?
 *
 * Una entrada sin `sistemas` vale para todos (el caso normal). Cuando la trae,
 * el mapeo sólo es válido para los sistemas listados: la descripción es
 * genérica y significa un producto distinto en cada sistema. Ver el JSDoc de
 * `MapeoAccesorio.sistemas` en tipos.ts.
 */
function aplicaAlSistema(entrada: MapeoAccesorio, sistema: string | undefined): boolean {
  if (!Array.isArray(entrada.sistemas) || entrada.sistemas.length === 0) return true;
  return typeof sistema === 'string' && entrada.sistemas.includes(sistema);
}

export interface ContextoAccesoriosDiseno {
  /** El diseño CRUDO del catálogo. `sistema` se usa para respetar
   * `MapeoAccesorio.sistemas`; sin él, una entrada restringida bloquea. */
  diseno?: { accesorios?: DisenoAccesorio[]; sistema?: string } | null;
  segmentoCliente?: string;
  cuerpos?: number;
  alasCorredizas?: number;
  anchoCm?: number;
  altoCm?: number;
  perimetroVidrioM?: number;
  [clave: string]: unknown;
}

function calcularCantidad(
  consumo: ConsumoAccesorio | null | undefined,
  accesorioDiseno: DisenoAccesorio,
  ctx: ContextoAccesoriosDiseno
): { ok: true; cantidad: number } | { ok: false; motivo: string } {
  if (!consumo || typeof consumo !== "object" || !TIPOS_CONSUMO_SOPORTADOS.includes(consumo.tipo)) {
    return {
      ok: false,
      motivo: `el "consumo" no trae un tipo reconocido (recibido: ${JSON.stringify(consumo?.tipo ?? consumo)}; soportados: ${TIPOS_CONSUMO_SOPORTADOS.join(", ")}).`,
    };
  }

  switch (consumo.tipo) {
    case "unidad": {
      // Cantidad tal cual la trae el propio accesorio del diseño. Un valor
      // ausente (null) es distinto de un cero explícito: null significa "no
      // se pudo determinar cuántos", que no es lo mismo que "cero de éste en
      // este diseño" -- y lo primero no se puede facturar sin inventar un
      // número, así que se trata como error, no como línea omitida.
      if (accesorioDiseno.cantidad === null || accesorioDiseno.cantidad === undefined) {
        return { ok: false, motivo: 'es de tipo "unidad" pero el diseño no trae una cantidad para este accesorio.' };
      }
      const cantidad = Number(accesorioDiseno.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0) {
        return { ok: false, motivo: `la cantidad del diseño ("${accesorioDiseno.cantidad}") no es un número válido.` };
      }
      return { ok: true, cantidad };
    }
    case "perimetroVidrio": {
      // ctx.perimetroVidrioM ya viene calculado por cotizarPorDiseno.js a
      // partir del despiece real de vidrio -- no se recalcula aquí.
      const base = Number(ctx.perimetroVidrioM);
      if (!Number.isFinite(base)) {
        return { ok: false, motivo: "perimetroVidrioM no está disponible en este contexto de cotización." };
      }
      const desperdicioPct = Number(consumo.desperdicioPct) || 0;
      return { ok: true, cantidad: base * (1 + desperdicioPct / 100) };
    }
    case "perimetroMarco": {
      const anchoCm = Number(ctx.anchoCm);
      const altoCm = Number(ctx.altoCm);
      if (!Number.isFinite(anchoCm) || !Number.isFinite(altoCm)) {
        return { ok: false, motivo: "anchoCm/altoCm no están disponibles en este contexto de cotización." };
      }
      return { ok: true, cantidad: (2 * (anchoCm + altoCm)) / 100 };
    }
    case "altoPorHoja": {
      const altoCm = Number(ctx.altoCm);
      const alasCorredizas = Number(ctx.alasCorredizas);
      if (!Number.isFinite(altoCm) || !Number.isFinite(alasCorredizas)) {
        return { ok: false, motivo: "altoCm/alasCorredizas no están disponibles en este contexto de cotización." };
      }
      const factor = Number.isFinite(Number(consumo.factor)) ? Number(consumo.factor) : 1;
      return { ok: true, cantidad: (altoCm / 100) * alasCorredizas * factor };
    }
    case "porAlasCorredizas": {
      // Piezas que van por HOJA CORREDIZA, no por cuerpo ni por unidad fija:
      // guías de 744/8025 (2 por ala), rodamientos (2 por ala), chapa (1 por
      // ala). Es la fórmula del Excel matriz; el `factor` es su multiplicador.
      //
      // Cero alas NO es un error: un diseño todo fijo ("OO") legítimamente no
      // lleva ninguna de estas piezas, y accesoriosPorDiseno ya omite la línea
      // cuando la cantidad sale en cero. Lo que sí es error es que el contexto
      // no traiga el dato -- entonces no se sabe si son cero o son diez.
      const alasCorredizas = Number(ctx.alasCorredizas);
      if (!Number.isFinite(alasCorredizas)) {
        return { ok: false, motivo: "alasCorredizas no está disponible en este contexto de cotización." };
      }
      const factor = Number.isFinite(Number(consumo.factor)) ? Number(consumo.factor) : 1;
      return { ok: true, cantidad: alasCorredizas * factor };
    }
    case "porCuerpos": {
      // Piezas que van por CUERPO (paño), corredizo o fijo: la guía plástica
      // del 5020 (2 por cuerpo) y el cerrojo (cuerpos/2, o sea factor 0,5).
      //
      // No se redondea a propósito: con un número impar de cuerpos el cerrojo
      // da media unidad y el Excel no dice hacia dónde va; redondear aquí
      // sería inventar la regla de negocio en el motor en vez de dejarla
      // escrita en el mapeo, que es donde la puede ver y corregir el taller.
      const cuerpos = Number(ctx.cuerpos);
      if (!Number.isFinite(cuerpos)) {
        return { ok: false, motivo: "cuerpos no está disponible en este contexto de cotización." };
      }
      const factor = Number.isFinite(Number(consumo.factor)) ? Number(consumo.factor) : 1;
      return { ok: true, cantidad: cuerpos * factor };
    }
    case "porAnchoEscalonado": {
      // Escalón por ancho: el Excel cobra 4 elevadores de tablero por debajo
      // de 1,51 m y 6 a partir de ahí. No es proporcional al ancho sino un
      // salto, así que no se puede expresar con un factor.
      //
      // Los tres parámetros son obligatorios y sin default: un umbral o una
      // cantidad ausentes harían que el motor eligiera un escalón a ciegas, y
      // en este proyecto un número inventado es peor que un error visible.
      const anchoCm = Number(ctx.anchoCm);
      if (!Number.isFinite(anchoCm)) {
        return { ok: false, motivo: "anchoCm no está disponible en este contexto de cotización." };
      }
      const umbralM = Number(consumo.umbralM);
      const cantidadBajo = Number(consumo.cantidadBajo);
      const cantidadAlto = Number(consumo.cantidadAlto);
      if (!Number.isFinite(umbralM) || !Number.isFinite(cantidadBajo) || !Number.isFinite(cantidadAlto)) {
        return {
          ok: false,
          motivo:
            'es de tipo "porAnchoEscalonado" pero su consumo no trae los tres números que necesita ' +
            "(umbralM, cantidadBajo, cantidadAlto). Revisa mapeo-accesorios.json.",
        };
      }
      // El umbral es inclusivo por el lado alto: el Excel dice "1,51 m o más → 6".
      return { ok: true, cantidad: anchoCm / 100 >= umbralM ? cantidadAlto : cantidadBajo };
    }
    default:
      // Inalcanzable: TIPOS_CONSUMO_SOPORTADOS ya filtró arriba. Se deja como
      // red de seguridad explícita en vez de dejar caer al `undefined`.
      return { ok: false, motivo: `tipo de consumo "${consumo.tipo}" no implementado.` };
  }
}

/**
 * Comprueba, sin necesitar el contexto de una cotización concreta, si una
 * entrada MAPEADA está en condiciones de producir una línea de BOM algún día:
 * código presente en el catálogo real y tipo de consumo reconocido. Se separa
 * de `calcularCantidad` porque estas dos condiciones no dependen de la medida
 * ni del diseño -- son las mismas para las 138 medidas posibles del mismo
 * diseño -- y las reutiliza `desgloseAccesorios` (que no recibe ctx).
 */
function validarEntradaMapeada(entrada: MapeoAccesorio) {
  if (!entrada.codigo || !getProducto(entrada.codigo)) {
    return { ok: false, motivo: `está mapeado al código "${entrada.codigo ?? "(ninguno)"}", que no existe en el catálogo real.` };
  }
  if (!entrada.consumo || typeof entrada.consumo !== "object" || !TIPOS_CONSUMO_SOPORTADOS.includes(entrada.consumo.tipo)) {
    return {
      ok: false,
      motivo: `tiene un "consumo" sin un tipo reconocido (soportados: ${TIPOS_CONSUMO_SOPORTADOS.join(", ")}).`,
    };
  }
  return { ok: true };
}

/** Línea de error de BOM para un accesorio que no se puede cobrar todavía.
 * Mismo patrón que errorLinea() en ventanas.js/proyectantes.js y las líneas
 * de error de motorDespiece.js: código visible = la descripción del
 * accesorio (no hay código de catálogo que mostrar), descripción = el motivo. */
function lineaError(descripcionAccesorio: string, motivo: string, cantidadDiseno: unknown) {
  const cantidadNum = Number(cantidadDiseno);
  return {
    codigo: descripcionAccesorio,
    descripcion: motivo,
    categoria: "ERROR",
    unidad: "",
    cantidad: Number.isFinite(cantidadNum) ? round2(cantidadNum) : 0,
    precioUnitario: 0,
    valorTotal: 0,
    error: true,
  };
}

/**
 * Callback `accesorios` para cotizarPorDiseno (ver JSDoc de `cotizarPorDiseno`
 * en cotizarPorDiseno.js, parámetro `opts.accesorios`, para el contrato
 * exacto del contexto que recibe). Lee `ctx.diseno.accesorios` -- el diseño
 * CRUDO que cotizarPorDiseno ya pasa al callback -- y produce una línea de
 * BOM por cada uno, según su clasificación en mapeo-accesorios.json.
 *
 * NO se auto-activa en ningún módulo: para que un sistema empiece a cobrar
 * por aquí en vez de por su mapa hardcodeado, un módulo tendría que pasar
 * `accesorios: accesoriosPorDiseno` explícitamente en su llamada a
 * cotizarPorDiseno, decisión que hoy nadie ha tomado (ver `sistemasActivos`).
 *
 * @param {Object} ctx
 * @param {Object} ctx.diseno - diseño crudo del catálogo (trae accesorios[]).
 * @param {string} ctx.segmentoCliente
 * @param {number} ctx.anchoCm - medida de FABRICACIÓN (no el vano).
 * @param {number} ctx.altoCm
 * @param {number} ctx.alasCorredizas
 * @param {number} [ctx.perimetroVidrioM]
 * @returns {Array} líneas de BOM (formato de lineaCatalogo/línea de error).
 */
export function accesoriosPorDiseno(ctx: ContextoAccesoriosDiseno) {
  const lista = Array.isArray(ctx?.diseno?.accesorios) ? ctx.diseno.accesorios : [];
  const mapeo = leerMapeoAccesorios();
  const lineas: LineaBOM[] = [];

  for (const a of lista) {
    const entrada = mapeo.accesorios?.[a.descripcion] ?? null;

    if (!entrada) {
      lineas.push(
        lineaError(
          a.descripcion,
          `"${a.descripcion}" no está en el mapeo de accesorios (mapeo-accesorios.json): falta clasificarlo antes de poder cobrarlo.`,
          a.cantidad
        )
      );
      continue;
    }

    if (entrada.estado === "IGNORADO") continue;
    if (entrada.estado === "INSUMO_NO_FACTURADO") continue; // va dentro del margen, nunca en el BOM

    if (entrada.estado !== "MAPEADO") {
      // PENDIENTE, o cualquier estado que no se reconozca: nunca $0 en silencio.
      lineas.push(
        lineaError(
          a.descripcion,
          `"${a.descripcion}" está PENDIENTE de mapear al catálogo real${entrada.nota ? `: ${entrada.nota}` : "."} No se cobra hasta que alguien lo decida (ver mapeo-accesorios.json).`,
          a.cantidad
        )
      );
      continue;
    }

    // El mapeo existe pero está restringido a otros sistemas: bloquear, nunca
    // cobrar el código de otro sistema por parecerse la descripción.
    if (!aplicaAlSistema(entrada, ctx?.diseno?.sistema)) {
      lineas.push(
        lineaError(
          a.descripcion,
          `"${a.descripcion}" está mapeado a ${entrada.codigo} sólo para ${entrada.sistemas!.join(", ")}, y este diseño es de ${ctx?.diseno?.sistema ?? "un sistema sin identificar"}. La descripción es genérica y significa un producto distinto en cada sistema: hay que mapearla para éste antes de cobrarla.`,
          a.cantidad
        )
      );
      continue;
    }

    // estado === "MAPEADO"
    const validacion = validarEntradaMapeada(entrada);
    if (!validacion.ok) {
      lineas.push(lineaError(a.descripcion, `"${a.descripcion}" ${validacion.motivo} Revisa mapeo-accesorios.json.`, a.cantidad));
      continue;
    }

    const resultadoCantidad = calcularCantidad(entrada.consumo, a, ctx);
    if (!resultadoCantidad.ok) {
      lineas.push(lineaError(a.descripcion, `"${a.descripcion}" ${resultadoCantidad.motivo}`, a.cantidad));
      continue;
    }

    // Cantidad cero (p.ej. altoPorHoja con 0 alas corredizas: un diseño todo
    // fijo) es una geometría legítima en la que este accesorio no aplica, no
    // un error -- mismo criterio que hacerAgregarRol() en cotizarPorDiseno.js.
    if (!(resultadoCantidad.cantidad! > 0)) continue;

    lineas.push(
      lineaCatalogo(entrada.codigo!, resultadoCantidad.cantidad!, ctx.segmentoCliente as string)
    );
  }

  return lineas;
}

/**
 * Desglose de los accesorios de un diseño por clasificación, SIN necesitar el
 * contexto de una cotización concreta (no calcula cantidades derivadas de
 * medidas -- ésas son responsabilidad de `accesoriosPorDiseno`). Pensado para
 * el futuro documento de taller: agrupa lo que se cobra, lo que se entrega
 * sin cobrar (insumos) y lo que sigue bloqueado, sin repetir la lógica de
 * clasificación de arriba.
 *
 * @param {Object} diseno - diseño crudo del catálogo (con accesorios[]).
 * @returns {{mapeados: Array, insumos: Array, pendientes: Array, ignorados: Array}}
 */
export function desgloseAccesorios(
  diseno: { accesorios?: DisenoAccesorio[]; sistema?: string } | null | undefined
) {
  const lista = Array.isArray(diseno?.accesorios) ? diseno.accesorios : [];
  const mapeo = leerMapeoAccesorios();

  const mapeados = [];
  const insumos = [];
  const pendientes = [];
  const ignorados = [];

  for (const a of lista) {
    const entrada = mapeo.accesorios?.[a.descripcion] ?? null;

    if (!entrada) {
      pendientes.push({ descripcion: a.descripcion, cantidad: a.cantidad ?? null, enMapeo: false, motivo: "No está en mapeo-accesorios.json." });
      continue;
    }

    switch (entrada.estado) {
      case "IGNORADO":
        ignorados.push({ descripcion: a.descripcion, cantidad: a.cantidad ?? null, nota: entrada.nota ?? null });
        break;
      case "INSUMO_NO_FACTURADO":
        insumos.push({ descripcion: a.descripcion, cantidad: a.cantidad ?? null, nota: entrada.nota ?? null });
        break;
      case "MAPEADO": {
        // Mismo guardarraíl que en accesoriosPorDiseno: un mapeo restringido a
        // otros sistemas no cuenta como resuelto para éste.
        if (!aplicaAlSistema(entrada, diseno?.sistema)) {
          pendientes.push({
            descripcion: a.descripcion,
            cantidad: a.cantidad ?? null,
            enMapeo: true,
            motivo: `Mapeado a ${entrada.codigo} sólo para ${entrada.sistemas!.join(", ")}; este diseño es de ${diseno?.sistema ?? "un sistema sin identificar"}.`,
          });
          break;
        }
        const validacion = validarEntradaMapeada(entrada);
        if (validacion.ok) {
          mapeados.push({
            descripcion: a.descripcion,
            cantidad: a.cantidad ?? null,
            codigo: entrada.codigo,
            consumo: entrada.consumo,
            nota: entrada.nota ?? null,
          });
        } else {
          // MAPEADO pero roto (código inexistente / consumo mal formado): se
          // reporta como pendiente para el taller, igual que se bloquearía
          // al cotizar -- nunca se presenta como "listo" algo que no lo está.
          pendientes.push({ descripcion: a.descripcion, cantidad: a.cantidad ?? null, enMapeo: true, motivo: validacion.motivo });
        }
        break;
      }
      default:
        // PENDIENTE, o cualquier valor de estado no reconocido.
        pendientes.push({ descripcion: a.descripcion, cantidad: a.cantidad ?? null, enMapeo: true, motivo: entrada.nota ?? null });
    }
  }

  return { mapeados, insumos, pendientes, ignorados };
}
