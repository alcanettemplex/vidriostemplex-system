// Módulo "Ventanas" — cotizador de ventanas de aluminio y vidrio. Por
// MEDIDAS LIBRES (sin diseño) sólo cubre 5020, 744 y 8025 (corrediza pesada;
// la variante "8025 TRES CORREDIZAS" se obtiene con el mismo sistema subiendo
// `alasCorredizas` a 3) — nunca se implementó esa estimación aproximada para
// 7038-Interior. Por DISEÑO (con disenoId) sí cubre los cuatro sistemas,
// 7038-Interior incluido: sus 23 diseños viven en disenos.json igual que los
// demás, y CATALOGO_SISTEMAS más abajo no necesita una entrada para él porque
// ese sistema no tiene accesorios hardcodeados configurados (ver
// CONTINUAR.md, "Mapeo de accesorios" — hallazgo pendiente de resolver).
//
// Ver análisis de referencia: analisis-para-webapp/modulos/ventanas.md / .json
//
// DISEÑO NUEVO (a propósito distinto del Excel) — por qué esto corrige los bugs:
//
// Bug #6 (BUGS_DETECTADOS.md): en el Excel, la celda de "cantidad" de la
// combinación 8025+GRIS PLATA no era un input real: traía por error el TOTAL EN
// PESOS de la propia ventana. Eso pasaba porque el Excel usaba, por cada color,
// una celda de "cantidad de unidades de ese color" que alimentaba las fórmulas.
// Aquí no existe ese concepto: `colorPerfileria` es sólo un selector de QUÉ
// código de catálogo comprar (un perfil por color), nunca una cantidad. Las
// cantidades de cada línea del BOM siempre se derivan de medidas reales
// (ancho/alto/cuerpos/alas), nunca de un precio ni de otro resultado. Además,
// el sistema 8025 en este catálogo real sólo existe en MATE y BRONCE: si se
// pide GRIS PLATA para 8025, `lineaCatalogo` devuelve la línea marcada como
// `error:true` (bug #4) en vez de inventar un número absurdo.
//
// Bug #7: en el Excel, el total de "aluminio" (P113, que ya sumaba cantidad×
// precio de cada accesorio para UNA ventana) se volvía a multiplicar por el
// número de unidades de ventana, duplicando el costo desde la 2ª unidad. Aquí
// cada línea de accesorio se calcula para **una sola ventana** (usando sólo
// ancho/alto/cuerpos/alasCorredizas) y es `totalizar()` quien multiplica el
// conjunto por `cantidadPiezas` **una única vez**, al final.

import { lineaCatalogo, totalizar, areaM2, round2 } from "../lib/motorCalculo";
import { getParametros } from "../lib/catalogo";
import { cotizarPorDiseno, hacerAgregarRol } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// Línea de BOM "manual" (sin código de catálogo) para cargos fijos de instalación
// (SMO, flete) que en el Excel original venían de referencias hardcodeadas a la
// tabla ACABADOS (COSTOS!$AC$32/$AC$33), no de códigos de catálogo con precio por
// segmento de cliente. Se centralizan en server/src/data/parametros.json (igual
// patrón usado en tablero.js/espejo.js) en vez de repetirse como constantes
// sueltas en cada módulo — ver decisión de producto sobre mano de obra/flete.
function lineaManual({
  codigo,
  descripcion,
  categoria,
  unidad,
  cantidad,
  precioUnitario,
}: {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
}) {
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

const COLORES = ["mate", "bronce", "gris plata", "blanco", "crudo"];

function normalizarColor(color: unknown): string {
  const c = String(color ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (c === "grisplata" || c === "gris-plata") return "gris plata";
  return c;
}

// Códigos reales del catálogo (server/src/data/catalogo.json) por sistema, rol
// y color. Sólo se listan los colores que de verdad existen en el catálogo:
// si un color no aparece aquí para un rol, esa línea queda marcada como error
// (código inexistente) en vez de cobrar $0 en silencio (bug #4).
const CATALOGO_SISTEMAS = {
  "5020": {
    cabezal: { blanco: "CAB0410", bronce: "CAB0510", crudo: "CAB0307", "gris plata": "CAB0203", mate: "CAB0102" },
    sillar: { blanco: "SIL0416", bronce: "SIL0506", crudo: "SIL1002", "gris plata": "SIL0205", mate: "SIL0104" },
    jamba: { blanco: "JAM0403", bronce: "JAM0504", crudo: "JAM1001", "gris plata": "JAM0102", mate: "JAM0103" },
    enganche: { blanco: "ENG0406", bronce: "ENG0504", crudo: "ENG1001", "gris plata": "ENG0102", mate: "ENG0103" },
    traslape: { blanco: "TRA0307", bronce: "TRA0102", crudo: "TRA1001", "gris plata": "TRA0201", mate: "TRA0103" },
    guia: { _: "GUIA5020" },
    rodamiento: { _: "RODA5020" },
    empaque: { _: "EMP5020" },
    sillarAlfajia: { mate: "SIA0102" },
  },
  "744": {
    cabezal: { blanco: "CAB0402", bronce: "CAB0508", "gris plata": "CAB0202", mate: "CAB0104" },
    sillar: { blanco: "SIL0408", bronce: "SIL0507", "gris plata": "SIL0212", mate: "SIL0744" },
    jamba: { blanco: "JAM0402", bronce: "JAM0505", "gris plata": "JAM0744", mate: "JAM0108" },
    enganche: { blanco: "ENG0403", bronce: "ENG0505", "gris plata": "ENG0202", mate: "ENG0101" },
    traslape: { blanco: "TRA0402", bronce: "TRA0203", "gris plata": "TRA0101", mate: "TRA0105" },
    horizontalInferior: { blanco: "HOI0402", bronce: "HOI0503", "gris plata": "HOI0204", mate: "HOI0101" },
    horizontalSuperior: { blanco: "HOS0401", bronce: "HOS0503", "gris plata": "HOS0202", mate: "HOS0101" },
    guiaInferior: { _: "GIN0101" },
    guiaSuperior: { _: "GSU0101" },
    rodamiento: { _: "ROD744" },
    empaque: { _: "EMP1305" },
    chapa: { _: "CHJ0101" }, // CHAPA JAGUAR 1 CARA
  },
  "8025": {
    cabezal: { bronce: "CAB0505", mate: "CABE8025" },
    sillar: { bronce: "SIL0510", mate: "SILL8025" },
    jamba: { bronce: "JAM0506", mate: "JAM8025" },
    enganche: { bronce: "ENG0503", mate: "ENGA8025" },
    traslape: { bronce: "TRA0502", mate: "TRAS8025" },
    horizontalInferior: { bronce: "HOI0505", mate: "HOIN8025" },
    horizontalSuperior: { bronce: "HOS0506", mate: "HOSU8025" },
    guiaInferior: { _: "GIN8025" },
    guiaSuperior: { _: "GSU8025" },
    rodamiento: { _: "ROD8025" },
    empaque: { _: "EMPA8025" },
    cerrojo: { _: "CPTOR" },
    chapa: { _: "CH8025S" }, // CHAPA 8025 SENCILLA CON SEGURO
  },
};

const VIDRIOS_VALIDOS = ["CL4MM01CR", "CL5MM01CR", "CL10MM01CR", "CL5MM03SP", "CL6MM03SP"];
const ACABADOS = { matizado: "MATI07", pelicula: "PELI31" };

export const meta = {
  nombre: "Ventanas",
  descripcion:
    "Cotizador de ventanas de aluminio y vidrio. Por diseño (disenoId): 5020, 744, 8025 y " +
    "7038-Interior. Por medidas libres (sin diseño): sólo 5020, 744 y 8025 (corrediza pesada); " +
    "para la variante '8025 tres corredizas' use sistema 8025 con alasCorredizas=3.",
  campos: [
    { nombre: "segmentoCliente", tipo: "select", opciones: ["PA", "PM", "PB"], etiqueta: "Tipo de cliente", requerido: true, grupo: "cliente" },
    { nombre: "sistema", tipo: "select", opciones: ["5020", "744", "8025"], etiqueta: "Sistema", requerido: true, grupo: "cliente" },
    {
      nombre: "colorPerfileria",
      tipo: "select",
      opciones: [
        { value: "mate", label: "Mate" },
        { value: "bronce", label: "Bronce" },
        { value: "gris plata", label: "Gris plata" },
        { value: "blanco", label: "Blanco" },
        { value: "crudo", label: "Crudo" },
      ],
      etiqueta: "Color de perfilería",
      requerido: true,
      grupo: "cliente",
    },
    // El campo se llama "...Cm" porque así lo interpreta calcular() más abajo
    // (compatibilidad con el motor ya verificado); la etiqueta en mm es sólo
    // presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (mm)", requerido: true, grupo: "medidas" },
    { nombre: "cuerpos", tipo: "number", etiqueta: "Cuerpos", requerido: true, grupo: "medidas" },
    { nombre: "alasCorredizas", tipo: "number", etiqueta: "Alas corredizas", requerido: false, grupo: "medidas" },
    { nombre: "alfajia", tipo: "number", etiqueta: "Alfajía (0 = no, 1 = sí)", requerido: false, grupo: "medidas" },
    {
      // Whitelist real que valida `calcular()` más abajo (VIDRIOS_VALIDOS) — si
      // se agrega un código aquí sin agregarlo también allá, el backend lo
      // ignora en silencio y cae al vidrio por defecto (CL4MM01CR).
      nombre: "codigoVidrio",
      tipo: "select",
      opciones: [
        { value: "CL4MM01CR", label: "Claro 4mm crudo" },
        { value: "CL5MM01CR", label: "Claro 5mm crudo" },
        { value: "CL10MM01CR", label: "Claro 10mm crudo" },
        { value: "CL5MM03SP", label: "Claro 5mm templado SP" },
        { value: "CL6MM03SP", label: "Claro 6mm templado SP" },
      ],
      etiqueta: "Tipo de vidrio",
      requerido: false,
      grupo: "vidrio",
    },
    { nombre: "matizado", tipo: "boolean", etiqueta: "Incluir matizado", requerido: false, grupo: "vidrio" },
    { nombre: "pelicula", tipo: "boolean", etiqueta: "Incluir película", requerido: false, grupo: "vidrio" },
    { nombre: "cantidadPiezas", tipo: "number", etiqueta: "Cantidad de ventanas idénticas", requerido: false, grupo: "comercial" },
    { nombre: "descuentoPct", tipo: "number", etiqueta: "Descuento (fracción 0-1)", requerido: false, grupo: "comercial" },
  ],
};

function errorLinea(codigoMostrado: string, descripcion: string, cantidad: number) {
  return {
    codigo: codigoMostrado,
    descripcion,
    categoria: "ERROR",
    unidad: "",
    cantidad: round2(cantidad),
    precioUnitario: 0,
    valorTotal: 0,
    error: true,
  };
}

/**
 * Cálculo por DISEÑO concreto (OX, XOX, OXXO...): en vez de estimar el consumo
 * de perfilería con reglas generalizadas, toma la medida de corte real de cada
 * pieza desde las fórmulas del catálogo de diseños.
 *
 * Los accesorios (guías, rodamientos, empaque, chapa, cerrojo) siguen saliendo
 * del mapa CATALOGO_SISTEMAS de arriba, porque el catálogo de diseños no trae
 * códigos de accesorio con precio en el catálogo de Templex. Lo que sí mejora es
 * su cantidad: el número de cuerpos y de alas corredizas deja de escribirse a
 * mano y se deduce del propio código del diseño.
 */
function calcularPorDiseno(
  input: InputModulo,
  {
    segmentoCliente,
    color,
    anchoCm,
    altoCm,
    cantidadPiezas,
    descuentoPct,
    codigoVidrio,
  }: {
    segmentoCliente: string;
    color: string;
    anchoCm: number;
    altoCm: number;
    cantidadPiezas: number;
    descuentoPct: number;
    codigoVidrio: string;
  }
) {
  return cotizarPorDiseno({
    disenoId: input.disenoId,
    anchoCm,
    altoCm,
    // Qué midió el vendedor: el vano de obra (lo normal) o directamente la
    // ventana terminada. De ahí depende si se descuenta la holgura.
    medidaEs: input.medidaEs,
    holguraAnchoMm: input.holguraAnchoMm,
    holguraAltoMm: input.holguraAltoMm,
    colorPerfileria: color,
    codigoVidrio,
    segmentoCliente,
    cantidadPiezas,
    descuentoPct,
    matizado: input.matizado,
    pelicula: input.pelicula,
    accesorios: ({ cuerpos, alasCorredizas, diseno, advertencias }) => {
      const sistemaCorto = diseno.sistema.replace(/^Sistema/, "").replace(/Reforzado$/, "");
      const roles = CATALOGO_SISTEMAS[sistemaCorto as keyof typeof CATALOGO_SISTEMAS];
      if (!roles) {
        advertencias.push(
          `No hay accesorios configurados para el sistema ${diseno.sistema}: el despiece incluye ` +
            `perfilería y vidrio, pero los accesorios quedan fuera del costo.`
        );
        return [];
      }
      const { agregar, lineas } = hacerAgregarRol(roles, { color, segmentoCliente, advertencias });
      agregar("guia", cuerpos * 2);
      agregar("guiaInferior", cuerpos);
      agregar("guiaSuperior", cuerpos);
      agregar("rodamiento", alasCorredizas * 2);
      agregar("empaque", (anchoCm / 100) * 2 + (altoCm / 100) * 2 * cuerpos);
      agregar("cerrojo", cuerpos / 2, true);
      agregar("chapa", alasCorredizas, true);
      // Alfajía: sólo si el vendedor la pidió, y con la referencia que Templex
      // vende para este sistema (no la que traía el diseño extraído).
      if (Number(input.alfajia) > 0) agregar("sillarAlfajia", anchoCm / 100, true);
      return lineas;
    },
  });
}

export function calcular(input: InputModulo = {}) {
  const advertencias: string[] = [];

  const segmentoCliente = ["PA", "PM", "PB"].includes(input.segmentoCliente) ? input.segmentoCliente : "PA";
  const sistema = ["5020", "744", "8025"].includes(input.sistema) ? input.sistema : "5020";
  const color = normalizarColor(input.colorPerfileria) || "mate";

  let anchoCm = Number(input.anchoCm);
  let altoCm = Number(input.altoCm);
  if (!Number.isFinite(anchoCm) || anchoCm <= 0) {
    anchoCm = 100;
    advertencias.push("Ancho no válido: se usó 100 cm por defecto.");
  }
  if (!Number.isFinite(altoCm) || altoCm <= 0) {
    altoCm = 100;
    advertencias.push("Alto no válido: se usó 100 cm por defecto.");
  }

  let cuerpos = Number.isFinite(Number(input.cuerpos)) ? Math.max(1, Number(input.cuerpos)) : 2;
  let alasCorredizas = Number.isFinite(Number(input.alasCorredizas)) ? Math.max(0, Number(input.alasCorredizas)) : cuerpos;
  const alfajia = Number(input.alfajia) > 0 ? 1 : 0;

  const cantidadPiezas = Number.isFinite(Number(input.cantidadPiezas)) && Number(input.cantidadPiezas) > 0
    ? Number(input.cantidadPiezas)
    : 1;
  const descuentoPct = Number.isFinite(Number(input.descuentoPct)) ? Number(input.descuentoPct) : 0;

  const codigoVidrio = VIDRIOS_VALIDOS.includes(input.codigoVidrio) ? input.codigoVidrio : "CL4MM01CR";

  // Si el vendedor eligió un diseño concreto del catálogo (OX, XOX, OXXO...), se
  // usa el despiece real en vez de las reglas generalizadas de abajo. Si el id no
  // existe, se sigue por el camino de parámetros libres.
  if (input.disenoId) {
    const porDiseno = calcularPorDiseno(input, {
      segmentoCliente,
      color,
      anchoCm,
      altoCm,
      cantidadPiezas,
      descuentoPct,
      codigoVidrio,
    });
    if (porDiseno) {
      porDiseno.advertencias = [...advertencias, ...porDiseno.advertencias];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó con medidas libres.`);
  }

  if (sistema === "8025" && !["mate", "bronce"].includes(color)) {
    advertencias.push('El sistema 8025 sólo tiene perfilería disponible en colores "mate" y "bronce" en el catálogo actual.');
  }
  if (sistema === "744" && color === "crudo") {
    advertencias.push('El sistema 744 no tiene variante en color "crudo" en el catálogo actual.');
  }

  const anchoM = anchoCm / 100;
  const altoM = altoCm / 100;
  const roles = CATALOGO_SISTEMAS[sistema as keyof typeof CATALOGO_SISTEMAS];

  const items = [];

  function agregarRol(rol: string, cantidad: number, { opcional = false }: { opcional?: boolean } = {}) {
    if (cantidad <= 0) return;
    const mapa = roles[rol as keyof typeof roles] as Record<string, string> | undefined;
    if (!mapa) return; // este rol no aplica al sistema (no es un accesorio faltante, no existe en el diseño)
    const codigo = mapa[color] ?? mapa._;
    if (!codigo) {
      if (opcional) {
        advertencias.push(`No hay código de "${rol}" para sistema ${sistema} color ${color}; línea omitida.`);
        return;
      }
      items.push(
        errorLinea(
          `${sistema}-${rol}-${color}`,
          `No existe accesorio de "${rol}" para sistema ${sistema} en color "${color}"`,
          cantidad
        )
      );
      return;
    }
    items.push(lineaCatalogo(codigo, cantidad, segmentoCliente));
  }

  // Perfiles horizontales (cabezal arriba, sillar abajo, horizontales sup/inf en 744/8025):
  // una longitud igual al ancho de la ventana.
  agregarRol("cabezal", anchoM);
  agregarRol("sillar", anchoM);
  agregarRol("horizontalInferior", anchoM);
  agregarRol("horizontalSuperior", anchoM);

  // Jambas: dos perfiles verticales de largo = alto.
  agregarRol("jamba", altoM * 2);

  // Enganches y traslapes: verticales, uno por cada unión entre cuerpos.
  agregarRol("enganche", altoM * cuerpos);
  agregarRol("traslape", altoM * (cuerpos > 1 ? cuerpos - 1 : 0));

  // Guías: 2 por cuerpo (repartidas en superior/inferior cuando el sistema las separa).
  agregarRol("guia", cuerpos * 2);
  agregarRol("guiaInferior", cuerpos);
  agregarRol("guiaSuperior", cuerpos);

  // Rodamientos: 2 por ala corrediza.
  agregarRol("rodamiento", alasCorredizas * 2);

  // Empaque de vidrio: perímetro aproximado del vano (ancho x2 + alto x2 por cuerpo).
  agregarRol("empaque", anchoM * 2 + altoM * 2 * cuerpos);

  // Cerrojo (sólo 8025): 1 cada 2 cuerpos.
  agregarRol("cerrojo", cuerpos / 2, { opcional: true });

  // Chapa: 1 por ala corrediza (744 y 8025).
  agregarRol("chapa", alasCorredizas, { opcional: true });

  // Sillar alfajía: sólo si el usuario activó el factor "alfajia".
  if (alfajia > 0) {
    agregarRol("sillarAlfajia", anchoM * alfajia, { opcional: true });
  }

  // Vidrio: área de UNA ventana (ancho x alto). El total informativo (areaM2)
  // se multiplica por cantidadPiezas más abajo.
  const areaUnaPieza = areaM2(anchoCm, altoCm);
  items.push(lineaCatalogo(codigoVidrio, areaUnaPieza, segmentoCliente));

  // Acabados opcionales, calculados sobre el área de vidrio de una pieza.
  if (input.matizado) items.push(lineaCatalogo(ACABADOS.matizado, areaUnaPieza, segmentoCliente));
  if (input.pelicula) items.push(lineaCatalogo(ACABADOS.pelicula, areaUnaPieza, segmentoCliente));

  // Mano de obra (SMO) y flete: valores fijos centralizados en parametros.json
  // (no varían por tipo de cliente PA/PM/PB), por la misma razón documentada en
  // tablero.js — no existen como códigos reales en el catálogo de 430 productos.
  const parametros = getParametros();
  const smoRate = parametros.smo?.tarifaMinima ?? 58000;
  const fleteFijo = parametros.flete_fijo ?? 25000;
  const smoValor = Math.max(round2(areaUnaPieza * smoRate), smoRate);
  items.push(
    lineaManual({
      codigo: "SMO",
      descripcion: "Servicio Mínimo de Obra",
      categoria: "INSTALACION",
      unidad: "GLOBAL",
      cantidad: 1,
      precioUnitario: smoValor,
    })
  );
  items.push(
    lineaManual({
      codigo: "GTFA26",
      descripcion: "Acarreo / Flete",
      categoria: "INSTALACION",
      unidad: "UND",
      cantidad: 1,
      precioUnitario: fleteFijo,
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
    areaM2: round2(areaUnaPieza * cantidadPiezas),
    advertencias,
  };
}
