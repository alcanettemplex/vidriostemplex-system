// Módulo "Proyectantes" — cotizador de ventanas proyectantes sistema 3831,
// organizadas por "naves" (paneles proyectantes), cada una con su propio
// ancho y alto.
//
// Ver análisis de referencia: analisis-para-webapp/modulos/proyectantes.md / .json
//
// DISEÑO NUEVO — por qué esto corrige los bugs #8 y #9 (BUGS_DETECTADOS.md):
//
// Bug #8: en el Excel, el área de vidrio (`O4 = H4*I4 + H66*H67`) sólo sumaba
// el área del paño principal MÁS UNA sola nave adicional, sin importar cuántas
// naves hubiera en realidad (H65). Aquí el área se calcula sumando TODAS las
// naves: `areaVidrio = numeroNaves * anchoNave * altoNave`.
//
// Bug #9: en el Excel existían DOS métodos paralelos para costear el aluminio
// — uno automático por número de naves (columna E) y otro manual digitando
// metros lineales (columna I) — y el total sumaba ambos sin impedirlo,
// duplicando el costo si el vendedor llenaba los dos. Aquí sólo se implementa
// **un único método**: el automático por número de naves (el único que se
// puede parametrizar sin pedirle al usuario que digite metros a mano), para
// las piezas que en el Excel sí tenían fórmula automática: brazo, empaque,
// manija, jamba, nave (perfil) y sillar cabezal. No existe ningún campo de
// "metros lineales manuales", así que no hay forma de duplicar el cálculo.

import { lineaCatalogo, totalizar, round2 } from "../lib/motorCalculo";
import { getParametros } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// Línea de BOM "manual" (sin código de catálogo) para cargos fijos de instalación
// (SMO, flete), centralizados en server/src/data/parametros.json — ver la nota
// equivalente en ventanas.js/tablero.js sobre por qué no son códigos de catálogo.
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

const COLORES_DISPONIBLES = {
  jamba: { mate: "JAM0503", "gris plata": "JAM0206", bronce: "JAM0101", blanco: "JAM0407" },
  nave: { mate: "NAV0101", "gris plata": "NAV0202", bronce: "NAV0503", blanco: "NAV0404" },
  sillarCabezal: {
    mate: "SIL0102",
    "gris plata": "SIL0203",
    crudo: "SIL0301",
    bronce: "SIL0504",
    blanco: "SIL0415",
  },
};
const BRAZO = "BRES0301";
const EMPAQUE = "EMP1301";
const MANIJA = "MBL0406";

const VIDRIOS_VALIDOS = ["CL4MM01CR", "CL5MM01CR", "CL6MM01CR"];
const ACABADOS = { matizado: "MATI07", pelicula: "PELI31" };

function normalizarColor(color: unknown): string {
  const c = String(color ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (c === "grisplata" || c === "gris-plata") return "gris plata";
  return c;
}

export const meta = {
  nombre: "Proyectantes",
  descripcion:
    "Cotizador de ventanas proyectantes sistema 3831, organizadas por naves (paneles). " +
    "Calcula automáticamente brazo, empaque, manija, jamba, nave y sillar cabezal a partir " +
    "del número de naves y sus medidas (único método de aluminio: por naves, sin metros manuales).",
  campos: [
    { nombre: "segmentoCliente", tipo: "select", opciones: ["PA", "PM", "PB"], etiqueta: "Tipo de cliente", requerido: true, grupo: "cliente" },
    { nombre: "numeroNaves", tipo: "number", etiqueta: "Número de naves", requerido: true, grupo: "medidas" },
    // "...Cm" en el nombre por compatibilidad con calcular(); la etiqueta en mm
    // es sólo presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoNaveCm", tipo: "number", etiqueta: "Ancho de cada nave (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoNaveCm", tipo: "number", etiqueta: "Alto de cada nave (mm)", requerido: true, grupo: "medidas" },
    {
      // "crudo" NO está en la lista a propósito: COLORES_DISPONIBLES.jamba/nave
      // (más abajo) no tienen código para ese color — pedirlo genera líneas en
      // error, no una ventana crudo válida. Ver el check de la línea ~196.
      nombre: "colorPerfileria",
      tipo: "select",
      opciones: [
        { value: "mate", label: "Mate" },
        { value: "gris plata", label: "Gris plata" },
        { value: "bronce", label: "Bronce" },
        { value: "blanco", label: "Blanco" },
      ],
      etiqueta: "Color de perfilería",
      requerido: true,
      grupo: "cliente",
    },
    {
      // Whitelist real que valida `calcular()` más abajo (VIDRIOS_VALIDOS).
      nombre: "codigoVidrio",
      tipo: "select",
      opciones: [
        { value: "CL4MM01CR", label: "Claro 4mm crudo" },
        { value: "CL5MM01CR", label: "Claro 5mm crudo" },
        { value: "CL6MM01CR", label: "Claro 6mm crudo" },
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

export function calcular(input: InputModulo = {}) {
  const advertencias: string[] = [];

  const segmentoCliente = ["PA", "PM", "PB"].includes(input.segmentoCliente) ? input.segmentoCliente : "PA";
  const color = normalizarColor(input.colorPerfileria) || "mate";

  // Camino por DISEÑO concreto (O, OO, OOO, W, O_O...): el despiece trae las
  // medidas de corte reales de jamba, nave, sillar-cabezal y pisavidrios, y el
  // número de naves sale del propio código del diseño. Aquí las medidas que
  // llegan son las del conjunto completo, no las de una nave.
  if (input.disenoId) {
    const anchoTotalCm = Number(input.anchoCm ?? input.anchoNaveCm);
    const altoTotalCm = Number(input.altoCm ?? input.altoNaveCm);
    const porDiseno = cotizarPorDiseno({
      disenoId: input.disenoId,
      anchoCm: Number.isFinite(anchoTotalCm) && anchoTotalCm > 0 ? anchoTotalCm : 100,
      altoCm: Number.isFinite(altoTotalCm) && altoTotalCm > 0 ? altoTotalCm : 100,
      medidaEs: input.medidaEs,
      holguraAnchoMm: input.holguraAnchoMm,
      holguraAltoMm: input.holguraAltoMm,
      colorPerfileria: color,
      codigoVidrio: VIDRIOS_VALIDOS.includes(input.codigoVidrio) ? input.codigoVidrio : "CL4MM01CR",
      segmentoCliente,
      cantidadPiezas:
        Number.isFinite(Number(input.cantidadPiezas)) && Number(input.cantidadPiezas) > 0
          ? Number(input.cantidadPiezas)
          : 1,
      descuentoPct: Number.isFinite(Number(input.descuentoPct)) ? Number(input.descuentoPct) : 0,
      matizado: input.matizado,
      pelicula: input.pelicula,
      accesorios: ({ cuerpos, segmentoCliente: seg, perimetroVidrioM }) => {
        // Los perfiles ya vienen del despiece; aquí sólo la herrajería, que el
        // catálogo de diseños no sabe costear. Una nave proyectante lleva dos
        // brazos y una manija; el empaque va alrededor de cada paño, así que se
        // deriva del perímetro real del vidrio y no de una estimación del vano.
        const lineas: LineaBOM[] = [];
        const naves = Math.max(1, cuerpos);
        lineas.push(lineaCatalogo(BRAZO, naves * 2, seg));
        lineas.push(lineaCatalogo(MANIJA, naves, seg));
        if (perimetroVidrioM > 0) lineas.push(lineaCatalogo(EMPAQUE, round2(perimetroVidrioM), seg));
        return lineas;
      },
    });
    if (porDiseno) {
      porDiseno.advertencias = [...advertencias, ...porDiseno.advertencias];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó por número de naves.`);
  }

  let numeroNaves = Number(input.numeroNaves);
  if (!Number.isFinite(numeroNaves) || numeroNaves <= 0) {
    numeroNaves = 1;
    advertencias.push("Número de naves no válido: se usó 1 por defecto.");
  }

  let anchoNaveCm = Number(input.anchoNaveCm);
  let altoNaveCm = Number(input.altoNaveCm);
  if (!Number.isFinite(anchoNaveCm) || anchoNaveCm <= 0) {
    anchoNaveCm = 60;
    advertencias.push("Ancho de nave no válido: se usó 60 cm por defecto.");
  }
  if (!Number.isFinite(altoNaveCm) || altoNaveCm <= 0) {
    altoNaveCm = 60;
    advertencias.push("Alto de nave no válido: se usó 60 cm por defecto.");
  }

  const cantidadPiezas = Number.isFinite(Number(input.cantidadPiezas)) && Number(input.cantidadPiezas) > 0
    ? Number(input.cantidadPiezas)
    : 1;
  const descuentoPct = Number.isFinite(Number(input.descuentoPct)) ? Number(input.descuentoPct) : 0;
  const codigoVidrio = VIDRIOS_VALIDOS.includes(input.codigoVidrio) ? input.codigoVidrio : "CL4MM01CR";

  if (!COLORES_DISPONIBLES.jamba[color as keyof typeof COLORES_DISPONIBLES.jamba] || !COLORES_DISPONIBLES.nave[color as keyof typeof COLORES_DISPONIBLES.nave]) {
    advertencias.push(
      `El color "${color}" no tiene jamba y/o nave 3831 disponibles en el catálogo actual (colores disponibles: mate, gris plata, bronce, blanco).`
    );
  }

  const anchoNaveM = anchoNaveCm / 100;
  const altoNaveM = altoNaveCm / 100;

  const items = [];

  function agregarCodigo(codigo: string, cantidad: number, descripcionSiFalta: string) {
    if (cantidad <= 0) return;
    if (!codigo) {
      items.push(errorLinea(`proyectantes-${descripcionSiFalta}-${color}`, descripcionSiFalta, cantidad));
      return;
    }
    items.push(lineaCatalogo(codigo, cantidad, segmentoCliente));
  }

  // Cantidades automáticas por número de naves (único método de aluminio, ver bug #9):
  const cantidadBrazo = numeroNaves * 2;
  const cantidadManija = numeroNaves;
  const cantidadJamba = altoNaveM * 2;
  const cantidadNave = numeroNaves * (anchoNaveM * 2 + altoNaveM * 2);
  const cantidadEmpaque = cantidadNave * 2;
  const cantidadSillarCabezal = anchoNaveM * 2;

  agregarCodigo(BRAZO, cantidadBrazo, "Brazo esculizable");
  agregarCodigo(MANIJA, cantidadManija, "Manija proyectante");
  agregarCodigo(COLORES_DISPONIBLES.jamba[color as keyof typeof COLORES_DISPONIBLES.jamba], cantidadJamba, `Jamba 3831 color ${color}`);
  agregarCodigo(COLORES_DISPONIBLES.nave[color as keyof typeof COLORES_DISPONIBLES.nave], cantidadNave, `Nave 3831 color ${color}`);
  agregarCodigo(EMPAQUE, cantidadEmpaque, "Empaque espagueti 3831");
  agregarCodigo(
    COLORES_DISPONIBLES.sillarCabezal[color as keyof typeof COLORES_DISPONIBLES.sillarCabezal],
    cantidadSillarCabezal,
    `Sillar cabezal 3831 color ${color}`
  );

  // Vidrio (bug #8 corregido): se suma el área de TODAS las naves, no sólo una.
  const areaUnaPieza = round2(numeroNaves * anchoNaveM * altoNaveM);
  items.push(lineaCatalogo(codigoVidrio, areaUnaPieza, segmentoCliente));

  if (input.matizado) items.push(lineaCatalogo(ACABADOS.matizado, areaUnaPieza, segmentoCliente));
  if (input.pelicula) items.push(lineaCatalogo(ACABADOS.pelicula, areaUnaPieza, segmentoCliente));

  // Mano de obra (SMO) y flete: valores fijos centralizados en parametros.json.
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
