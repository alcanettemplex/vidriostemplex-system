// Módulo "Tablero" — vidrio templado de 6mm u 8mm con BPB (borde pulido brillado),
// perforaciones, elevadores, matizado y película opcionales, SMO y flete.
//
// Basado en el análisis funcional del Excel original:
//   analisis-para-webapp/modulos/tablero.md / tablero.json
//
// DECISIÓN DE PRODUCTO (confirmada con el cliente): en el Excel había 5 bloques
// idénticos donde el vendedor marcaba cantidades por tipo de acabado, con un
// umbral fijo de ancho (1.51 m) que definía cuántas perforaciones/elevadores
// llevaba la pieza. Aquí eso se PARAMETRIZA a medidas libres: el vendedor
// escribe ancho/alto en centímetros y el sistema calcula área/perímetro reales
// y deriva la cantidad de accesorios a partir de esas medidas.
//
// Bugs del Excel corregidos explícitamente en este módulo:
//   - Bug #3 (etiqueta "antes de IVA" engañosa): este módulo no inventa etiquetas
//     propias — usa tal cual las claves de `totalizar()` (subtotalConAiu, baseIva,
//     iva, total), que ya están nombradas sin ambigüedad.
//   - Bug #5 (código PELI31 duplicado: "Película Normal" vs "Película Ultravisión"):
//     el catálogo maestro (server/src/data/catalogo.json) solo conserva la entrada
//     "PELICULA NORMAL" bajo PELI31 (la "Ultravisión" fue descartada en la
//     normalización, ver analisis-para-webapp/modulos/costos.json). Este módulo
//     ofrece únicamente "película" como opción booleana (mapeada a PELI31) y
//     agrega una advertencia explícita cuando se activa, para que el vendedor
//     sepa que "Ultravisión" no está disponible hasta que se corrija el catálogo.
//   - Bug #10 (doble conteo de cantidad): en el Excel, el campo final "Cantidad de
//     unidades" (D5) volvía a multiplicar un subtotal que YA incluía las
//     cantidades de vidrio 6mm/8mm de cada línea. Aquí NO existe ningún campo de
//     "cantidad" dentro del cálculo de línea (el vidrio se cuantifica por ÁREA
//     real, no por "cantidad de piezas de 6mm"): la ÚNICA multiplicación por
//     "cuántas piezas iguales se cotizan" ocurre una vez, dentro de `totalizar()`
//     vía `cantidadPiezas`. Ninguna línea del BOM se multiplica por esa cantidad.
import { lineaCatalogo, totalizar, areaM2, perimetroM, round2, tarifaSMO } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// Umbral de ancho documentado en tablero.md (celda K12/K13 del Excel original:
// `=IF(E$9>=1.51,6,IF(E$9>0,4,0))`), parametrizado a centímetros según la
// instrucción de negocio: anchoCm > 151 -> 6 perforaciones/elevadores; si no, 4.
const UMBRAL_ANCHO_CM = 151;

/** Construye una línea de BOM "manual" (sin código de catálogo) para cargos fijos
 * de instalación (SMO, flete) que en el Excel original venían de referencias
 * hardcodeadas a celdas de la tabla ACABADOS (COSTOS!$AC$32/$AC$33), y que en la
 * web app se centralizan en server/src/data/parametros.json en vez de repetirse
 * como constantes sueltas en cada módulo. */
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

export const meta = {
  nombre: "Tablero",
  descripcion:
    "Tablero de vidrio templado (6mm u 8mm) con BPB, perforaciones y elevadores según el ancho real, más matizado y película opcionales. Medidas libres en centímetros.",
  campos: [
    // "...Cm" en el nombre por compatibilidad con calcular(); la etiqueta en mm
    // es sólo presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (mm)", requerido: true, grupo: "medidas" },
    { nombre: "espesorMm", tipo: "select", opciones: [6, 8], etiqueta: "Espesor (mm)", requerido: true, grupo: "vidrio" },
    { nombre: "matizado", tipo: "boolean", etiqueta: "Matizado total (MATI07)", requerido: false, grupo: "vidrio" },
    {
      nombre: "pelicula",
      tipo: "boolean",
      etiqueta: "Película de seguridad (solo variante Normal disponible)",
      requerido: false,
      grupo: "vidrio",
    },
    { nombre: "segmentoCliente", tipo: "select", opciones: ["PA", "PM", "PB"], etiqueta: "Tipo de cliente", requerido: true, grupo: "cliente" },
    { nombre: "cantidadPiezas", tipo: "number", etiqueta: "Cantidad de piezas iguales", requerido: true, grupo: "comercial" },
    { nombre: "descuentoPct", tipo: "number", etiqueta: "Descuento (fracción 0-1)", requerido: false, grupo: "comercial" },
  ],
};

export function calcular(input: InputModulo) {
  const {
    anchoCm,
    altoCm,
    espesorMm,
    matizado = false,
    pelicula = false,
    segmentoCliente,
    cantidadPiezas = 1,
    descuentoPct = 0,
  } = input ?? {};

  // --- Validación de inputs obligatorios ---
  const ancho = Number(anchoCm);
  const alto = Number(altoCm);
  if (!Number.isFinite(ancho) || ancho <= 0) {
    throw new Error("anchoCm es obligatorio y debe ser un número mayor a 0.");
  }
  if (!Number.isFinite(alto) || alto <= 0) {
    throw new Error("altoCm es obligatorio y debe ser un número mayor a 0.");
  }
  const espesor = Number(espesorMm);
  if (espesor !== 6 && espesor !== 8) {
    throw new Error("espesorMm es obligatorio y debe ser 6 u 8.");
  }
  if (!segmentosValidos().includes(segmentoCliente)) {
    throw new Error(`segmentoCliente inválido: "${segmentoCliente}". Debe ser uno de ${segmentosValidos().join(", ")}.`);
  }
  const cantPiezas = Number(cantidadPiezas);
  if (!Number.isInteger(cantPiezas) || cantPiezas <= 0) {
    throw new Error("cantidadPiezas es obligatorio y debe ser un entero mayor a 0.");
  }
  const descuento = Number(descuentoPct) || 0;
  if (descuento < 0 || descuento >= 1) {
    throw new Error("descuentoPct debe ser una fracción entre 0 (inclusive) y 1 (exclusive).");
  }

  const parametros = getParametros();
  // SMO02 del Excel: el tablero se instala en fachada. `pisoTableroGrande` se
  // conserva porque es un piso propio de este módulo que el Excel no modela.
  const smoRate = tarifaSMO(parametros, "fachadas");
  const smoPisoGrande = parametros.smo?.pisoTableroGrande ?? 87000;
  const fleteFijo = parametros.flete_fijo ?? 40000;

  const area = areaM2(ancho, alto);
  const perimetro = perimetroM(ancho, alto);
  const esPiezaGrande = ancho > UMBRAL_ANCHO_CM;
  const cantidadAccesorios = esPiezaGrande ? 6 : 4;

  const codigoVidrio = espesor === 8 ? "CL8MM03SP" : "CL6MM03SP";
  const codigoBpb = espesor === 8 ? "BPB05" : "BPB04";

  const advertencias: string[] = [];

  const items = [];
  items.push(lineaCatalogo(codigoVidrio, area, segmentoCliente, { unidadOverride: "M2" }));
  items.push(lineaCatalogo(codigoBpb, perimetro, segmentoCliente, { unidadOverride: "ML" }));
  items.push(lineaCatalogo("PERF01", cantidadAccesorios, segmentoCliente, { unidadOverride: "UND" }));
  items.push(lineaCatalogo("ELE1101", cantidadAccesorios, segmentoCliente, { unidadOverride: "UND" }));

  if (matizado) {
    items.push(lineaCatalogo("MATI07", area, segmentoCliente, { unidadOverride: "M2" }));
  }
  if (pelicula) {
    items.push(lineaCatalogo("PELI31", area, segmentoCliente, { unidadOverride: "M2" }));
    advertencias.push(
      'Solo está disponible la variante "Película Normal" (código PELI31). "Película Ultravisión" ' +
        "tenía el mismo código duplicado en el Excel original (bug #5) y quedó descartada al normalizar " +
        "el catálogo maestro; debe agregarse un código propio en catalogo.json si se necesita ofrecerla."
    );
  }

  // Servicio Mínimo de Obra: tarifa plana para piezas pequeñas (ancho <= 1.51m);
  // para piezas grandes, el mayor entre el piso de $87.000 y el valor por área a
  // $58.000/m² (igual regla de negocio que L16 en tablero.md, con los valores
  // ahora centralizados en parametros.json en vez de referencias hardcodeadas).
  const smoBase = round2(area * smoRate);
  const smoValor = esPiezaGrande ? Math.max(smoBase, smoPisoGrande) : smoRate;
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
    cantidadPiezas: cantPiezas,
    descuentoPct: descuento,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });

  return { ...resultado, areaM2: area, advertencias };
}
