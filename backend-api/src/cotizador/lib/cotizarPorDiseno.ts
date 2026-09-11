// Cotización de un ítem a partir de un DISEÑO concreto del catálogo.
//
// Reúne lo que es común a todos los módulos de producto cuando se cotiza por
// diseño en vez de por medidas libres: despiece real (motorDespiece), acabados
// opcionales sobre el área de vidrio, mano de obra, flete y la totalización.
//
// Lo único que cambia de un módulo a otro son los accesorios, porque el catálogo
// de diseños no trae códigos de accesorio con precio en Templex: cada módulo
// sabe qué códigos usa su sistema. Por eso se pasan como función.
import { lineaCatalogo, totalizar, areaM2, round2, tarifaSMO } from "./motorCalculo";
import { getParametros } from "./catalogo";
import { calcularDespiece, getDiseno } from "./motorDespiece";
import { holguraEfectiva } from "./calibracion";
import { getHolguras } from "../store/calibracionStore";
import { parsearCodigo } from "./codigoDiseno";
import type { LineaBOM, TipoObra } from "./motorCalculo";
import type { CortePerfil, CorteVidrio, Diseno } from "../tipos";

const ACABADOS = { matizado: "MATI07", pelicula: "PELI31" };

interface ParamsLineaManual {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}

function lineaManual({
  codigo,
  descripcion,
  categoria,
  unidad,
  cantidad,
  precioUnitario,
}: ParamsLineaManual) {
  const cantidadRedondeada = round2(cantidad);
  return {
    codigo,
    descripcion,
    categoria,
    unidad,
    cantidad: cantidadRedondeada,
    precioUnitario,
    valorTotal: round2(precioUnitario * cantidadRedondeada),
    error: false,
  };
}

/**
 * @param {Object} opts
 * @param {string} opts.disenoId
 * @param {number} opts.anchoCm  - ancho TOTAL en centímetros. Qué mide depende de
 *        `medidaEs`: por defecto es el VANO (el hueco de obra).
 * @param {number} opts.altoCm
 * @param {"vano"|"fabricacion"} [opts.medidaEs="vano"] - qué escribió el vendedor.
 * @param {number} [opts.holguraAnchoMm] - descuento del vano para esta cotización
 *        concreta. Si no viene, se usa el configurado para el sistema.
 * @param {number} [opts.holguraAltoMm]
 * @param {string} opts.colorPerfileria
 * @param {string} opts.codigoVidrio
 * @param {string} opts.segmentoCliente
 * @param {number} opts.cantidadPiezas
 * @param {number} opts.descuentoPct
 * @param {boolean} opts.matizado
 * @param {boolean} opts.pelicula
 * @param {boolean} opts.incluirAlfajia
 * @param {Function} [opts.accesorios] - (ctx) => Array de líneas de BOM. Recibe
 *        { cuerpos, alasCorredizas, anchoCm, altoCm, color, segmentoCliente,
 *          diseno, agregarRol, advertencias }.
 * @returns {Object|null} resultado totalizado, o null si el diseño no existe.
 */
export interface ContextoAccesorios {
  cuerpos: number;
  alasCorredizas: number;
  /** Medida de FABRICACIÓN, no del vano: los accesorios van sobre la ventana. */
  anchoCm: number;
  altoCm: number;
  anchoVanoCm: number | null;
  altoVanoCm: number | null;
  color: string;
  segmentoCliente: string;
  diseno: Diseno;
  advertencias: string[];
  cortes: { perfiles: CortePerfil[]; vidrios: CorteVidrio[] };
  areaVidrioM2: number;
  perimetroVidrioM: number;
}

export interface ParamsCotizarPorDiseno {
  disenoId: string;
  anchoCm: number;
  altoCm: number;
  /** "vano" (se descuenta la holgura) o "fabricacion" (medida final). */
  medidaEs?: string;
  holguraAnchoMm?: number;
  holguraAltoMm?: number;
  colorPerfileria?: string;
  codigoVidrio?: string;
  segmentoCliente?: string;
  cantidadPiezas?: number;
  descuentoPct?: number;
  matizado?: boolean;
  pelicula?: boolean;
  incluirAlfajia?: boolean;
  /** Tipo de obra que decide qué tarifa de SMO se cobra. Lo declara el módulo
   * que llama (cabinas cobran distinto que armar una ventana); si no llega, se
   * usa el piso genérico `tarifaMinima`. */
  tipoObra?: TipoObra;
  /** Callback del módulo para añadir sus propias líneas de accesorios. Recibe
   * el contexto ya calculado de la pieza; el módulo suele construir sus
   * líneas con `hacerAgregarRol`. */
  accesorios?: (ctx: ContextoAccesorios) => LineaBOM[] | void;
}

export function cotizarPorDiseno({
  disenoId,
  anchoCm,
  altoCm,
  medidaEs = "vano",
  holguraAnchoMm,
  holguraAltoMm,
  colorPerfileria = "mate",
  codigoVidrio,
  segmentoCliente = "PA",
  cantidadPiezas = 1,
  descuentoPct = 0,
  matizado = false,
  pelicula = false,
  incluirAlfajia = false,
  tipoObra,
  accesorios,
}: ParamsCotizarPorDiseno) {
  const diseno = getDiseno(disenoId);
  if (!diseno) return null;

  // --- Del vano a la medida de fabricación --------------------------------
  // Las fórmulas de despiece describen la VENTANA, no el hueco donde va. Si se
  // les entrega el vano tal cual, la ventana sale del tamaño exacto del hueco y
  // no entra. Aquí se hace explícita la primera de las dos restas.
  const avisosMedida = [];
  const esVano = medidaEs !== "fabricacion";
  const holguraConfigurada = holguraEfectiva(getHolguras(), { sistema: diseno.sistema });
  const hayOverride = Number.isFinite(Number(holguraAnchoMm)) || Number.isFinite(Number(holguraAltoMm));
  const holgura = !esVano
    ? { anchoMm: 0, altoMm: 0, origen: "no-aplica", clave: null, nota: null }
    : hayOverride
      ? {
          anchoMm: Number(holguraAnchoMm) || 0,
          altoMm: Number(holguraAltoMm) || 0,
          origen: "cotizacion",
          clave: null,
          nota: "Holgura escrita a mano para esta cotización.",
        }
      : holguraConfigurada;

  const anchoVanoCm = esVano ? anchoCm : null;
  const altoVanoCm = esVano ? altoCm : null;
  const anchoFabCm = esVano ? anchoCm - holgura.anchoMm / 10 : anchoCm;
  const altoFabCm = esVano ? altoCm - holgura.altoMm / 10 : altoCm;

  if (esVano && holgura.origen === "ausente") {
    avisosMedida.push(
      `La holgura de instalación del sistema ${diseno.sistema} no está configurada: se está ` +
        `despiezando a la medida exacta del vano, sin descontar nada. Sirve para cotizar; para ` +
        `cortar hay que definirla en Calibración → Holguras.`
    );
  }
  if (anchoFabCm <= 0 || altoFabCm <= 0) {
    return {
      items: [],
      cortes: { perfiles: [], vidrios: [] },
      subtotal: 0,
      total: 0,
      hayErrores: true,
      advertencias: [
        `Con una holgura de ${holgura.anchoMm}×${holgura.altoMm} mm, un vano de ${anchoCm}×${altoCm} cm ` +
          `deja una medida de fabricación de cero o negativa. Revisa la holgura o la medida.`,
      ],
    };
  }

  const despiece = calcularDespiece({
    disenoId,
    anchoCm: anchoFabCm,
    altoCm: altoFabCm,
    colorPerfileria,
    codigoVidrio,
    segmentoCliente,
    incluirAlfajia,
  });

  const advertencias = [...avisosMedida, ...despiece.advertencias];
  const items = [...despiece.items];

  // Cuerpos y alas se leen del propio código del diseño ("OXXO" = 4 cuerpos,
  // 2 corredizas), en vez de pedírselos al vendedor.
  //
  // CORRECCIÓN DE BUG: antes se usaba `diseno.paneles` (un campo de
  // disenos.json calculado contando con una regex TODAS las letras
  // O,X,W,B,P,Z del código completo, sufijo incluido) y
  // `codigo.match(/X/g)` sobre el código completo — mismo problema. El
  // sufijo tras el primer "_" es texto descriptivo libre ("3P", "CABINA",
  // "BOLSILLO_CERROJOPR"...) que por coincidencia del idioma a veces
  // contiene esas letras, así que ambos números salían inflados: p.ej.
  // "XXX_3P" (3 paneles reales) contaba `paneles:4` por la "P" de "3P", y
  // eso se traducía en guías/empaque de más cobrados en `modules/ventanas.js`.
  // `parsearCodigo` (lib/codigoDiseno.js) cuenta sólo el código real, no el
  // sufijo — ver ese archivo para el detalle y la verificación contra los
  // 138 diseños del catálogo (43 tenían el campo corrupto).
  const codigo = diseno.diseno;
  const analisisCodigo = parsearCodigo(codigo, { modulo: diseno.modulo });
  const cuerpos = analisisCodigo.paneles || 1;
  const alasCorredizas = analisisCodigo.alas;

  if (typeof accesorios === "function") {
    const lineas = accesorios({
      cuerpos,
      alasCorredizas,
      // Los accesorios van sobre la ventana, no sobre el hueco: aquí anchoCm y
      // altoCm son ya la medida de FABRICACIÓN. El vano queda aparte para lo
      // que de verdad dependa de la obra.
      anchoCm: anchoFabCm,
      altoCm: altoFabCm,
      anchoVanoCm,
      altoVanoCm,
      color: colorPerfileria,
      segmentoCliente,
      diseno,
      advertencias,
      // Medidas ya calculadas: permiten derivar consumos que dependen del
      // despiece real (empaque alrededor de cada paño, por ejemplo) en vez de
      // estimarlos sobre el vano completo.
      cortes: despiece.cortes,
      areaVidrioM2: despiece.areaVidrioM2 ?? 0,
      perimetroVidrioM: (despiece.cortes.vidrios || []).reduce(
        (acc, v) => acc + 2 * ((v.anchoMm + v.altoMm) / 1000) * v.cantidad,
        0
      ),
    });
    if (Array.isArray(lineas)) items.push(...lineas);
  }

  const areaVidrio = despiece.areaVidrioM2 ?? 0;
  if (matizado && areaVidrio > 0) items.push(lineaCatalogo(ACABADOS.matizado, areaVidrio, segmentoCliente));
  if (pelicula && areaVidrio > 0) items.push(lineaCatalogo(ACABADOS.pelicula, areaVidrio, segmentoCliente));

  const parametros = getParametros();
  // La mano de obra se cobra por el hueco que se tapa, no por la ventana: si el
  // vendedor midió el vano, es ése el que manda.
  const areaVano = areaM2(anchoVanoCm ?? anchoFabCm, altoVanoCm ?? altoFabCm);
  const smoRate = tarifaSMO(parametros, tipoObra);
  items.push(
    lineaManual({
      codigo: "SMO",
      descripcion: "Servicio Mínimo de Obra",
      categoria: "INSTALACION",
      unidad: "GLOBAL",
      cantidad: 1,
      precioUnitario: Math.max(round2(areaVano * smoRate), smoRate),
    })
  );
  items.push(
    lineaManual({
      codigo: "GTFA26",
      descripcion: "Acarreo / Flete",
      categoria: "INSTALACION",
      unidad: "UND",
      cantidad: 1,
      precioUnitario: parametros.flete_fijo ?? 40000,
    })
  );

  const resultado = totalizar(items, {
    cantidadPiezas,
    descuentoPct,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });

  return {
    ...resultado,
    areaM2: round2(areaVano * cantidadPiezas),
    diseno: despiece.diseno,
    // La cadena completa de medidas, explícita: el taller tiene que poder ver de
    // dónde sale cada número, y la calibración necesita guardar el vano y la
    // medida de fabricación por separado para no mezclar las dos restas.
    medidas: {
      modoEntrada: esVano ? "vano" : "fabricacion",
      vano: esVano ? { anchoCm: round2(anchoCm), altoCm: round2(altoCm) } : null,
      fabricacion: { anchoCm: round2(anchoFabCm), altoCm: round2(altoFabCm) },
      holgura,
    },
    cortes: despiece.cortes,
    // Sin holgura configurada no se puede cortar aunque la fórmula sea exacta:
    // se estaría fabricando la ventana del tamaño del hueco.
    aptoParaCorte: despiece.aptoParaCorte && !(esVano && holgura.origen === "ausente"),
    advertencias,
  };
}

/** Helper para que cada módulo arme sus accesorios desde un mapa
 * { rol: { color: codigo } | { _: codigo } }, como los que ya tienen. */
export function hacerAgregarRol(
  mapaRoles: Record<string, Record<string, string>> | null | undefined,
  {
    color,
    segmentoCliente,
    advertencias,
  }: { color: string; segmentoCliente: string; advertencias: string[] }
) {
  const lineas: LineaBOM[] = [];
  const agregar = (rol: string, cantidad: number, opcional = false) => {
    if (!(cantidad > 0)) return;
    const mapa = mapaRoles?.[rol];
    if (!mapa) return;
    const cod = mapa[color] ?? mapa._;
    if (!cod) {
      if (!opcional) advertencias.push(`No existe "${rol}" en color "${color}" en el catálogo.`);
      return;
    }
    lineas.push(lineaCatalogo(cod, cantidad, segmentoCliente));
  };
  return { agregar, lineas };
}
