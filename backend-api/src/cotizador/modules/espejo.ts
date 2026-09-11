// Módulo "Espejo" — espejo de 4mm en acabado BPB (normal/flotante) o BISELADO
// (excluyentes entre sí), con soporte tubular T-76 opcional, SMO y flete.
//
// Basado en el análisis funcional del Excel original:
//   analisis-para-webapp/modulos/espejo.md / espejo.json
//
// DECISIÓN DE PRODUCTO (confirmada con el cliente): igual que en Tablero, los 5
// bloques del Excel se PARAMETRIZAN a medidas libres: el vendedor escribe
// ancho/alto en centímetros y el sistema calcula área (espejo) y perímetro
// (BPB) reales.
//
// Bugs del Excel corregidos explícitamente en este módulo:
//   - Bug #3 (etiqueta "antes de IVA" engañosa): no se inventan etiquetas propias;
//     se usan tal cual las claves de `totalizar()` (subtotalConAiu, baseIva, iva,
//     total).
//   - Bug #5 (PELI31 duplicado): no aplica directamente a Espejo (no usa película).
//     Sobre el biselado: el catálogo maestro sigue sin un SKU propio, pero el Excel
//     matriz SÍ distingue ESP01 ($146.000) de ESP02 ($168.000) en su tabla ACABADOS.
//     Desde 2026-09-11 se cobra ES0001 más el diferencial del 15,07% (ver
//     RECARGO_BISELADO), en vez de cobrar lo mismo por ambos acabados.
//   - Bug #10 (doble conteo de cantidad): en el Excel, el campo final "Cantidad de
//     unidades" (C5) volvía a multiplicar un subtotal que YA incluía las
//     cantidades de espejo BPB/biselado de cada línea. Aquí NO existe ningún campo
//     de "cantidad" dentro del cálculo de línea (el espejo se cuantifica por ÁREA
//     real). La ÚNICA multiplicación por "cuántas piezas iguales se cotizan"
//     ocurre una vez, dentro de `totalizar()` vía `cantidadPiezas`.
//   - Acabado BPB vs BISELADO son mutuamente excluyentes por diseño: se modelan
//     como un único campo `acabado` de tipo select (no dos checkboxes
//     independientes), evitando el bug #11 ("se pueden marcar varias opciones a
//     la vez sin que el sistema avise") que afecta a otros módulos del Excel.
import { lineaCatalogo, totalizar, areaM2, perimetroM, round2, tarifaSMO } from "../lib/motorCalculo";
import { getParametros, getPrecio, segmentosValidos } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

const ACABADOS_VALIDOS = ["BPB", "BISELADO"];

/**
 * Recargo del espejo biselado sobre el espejo estándar.
 *
 * El Excel matriz SÍ diferencia los dos productos en la tabla ACABADOS de la
 * hoja COSTOS: `ESP01` "ESPEJO" a $146.000 y `ESP02` "ESPEJO BISELADO" a
 * $168.000. Hasta el 2026-09-11 este módulo cobraba el mismo precio para ambos
 * acabados, o sea regalaba el 15% del bisel en cada cotización.
 *
 * Se aplica como RAZÓN y no como precio fijo a propósito: los $168.000 del
 * Excel son un precio plano que no distingue PA/PM/PB, y meterlo tal cual haría
 * que un cliente PB pagara lo mismo que un PA — justo lo contrario del modelo
 * de precios por segmento que rige todo el resto del catálogo. Aplicando la
 * razón sobre el precio ya segmentado de ES0001 se conserva la segmentación y
 * se cobra la prima real.
 *
 * Lo correcto de fondo es un SKU propio (ES0002) con sus tres precios reales;
 * mientras no exista, esto es lo más fiel que se puede ser sin inventar datos.
 */
const RECARGO_BISELADO = 168000 / 146000;

/** Línea de BOM "manual" (sin código de catálogo) para cargos fijos de
 * instalación (SMO, flete), centralizados en parametros.json (ver misma nota en
 * tablero.js). */
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
  nombre: "Espejo",
  descripcion:
    "Espejo de 4mm en acabado BPB (borde pulido brillado) o BISELADO (excluyentes), con soporte tubular T-76 opcional. Medidas libres en centímetros.",
  campos: [
    // "...Cm" en el nombre por compatibilidad con calcular(); la etiqueta en mm
    // es sólo presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (mm)", requerido: true, grupo: "medidas" },
    { nombre: "acabado", tipo: "select", opciones: ACABADOS_VALIDOS, etiqueta: "Acabado de borde", requerido: true, grupo: "vidrio" },
    {
      nombre: "tubularCantidad",
      tipo: "number",
      etiqueta: "Soportes tubulares T-76 (unidades, 0 = sin tubular)",
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
    acabado,
    tubularCantidad = 0,
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
  if (!ACABADOS_VALIDOS.includes(acabado)) {
    throw new Error(`acabado es obligatorio y debe ser uno de: ${ACABADOS_VALIDOS.join(", ")}.`);
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
  const cantTubular = Number(tubularCantidad) || 0;
  if (cantTubular < 0) {
    throw new Error("tubularCantidad no puede ser negativa.");
  }

  const parametros = getParametros();
  // SMO02 del Excel: la hoja "Espejo" toma la mano de obra de COSTOS!$AC$33,
  // que es justamente SMO Fachadas. No es un descuido: el espejo se instala
  // sobre muro, con el mismo oficio que una fachada.
  const smoRate = tarifaSMO(parametros, "fachadas");
  const fleteFijo = parametros.flete_fijo ?? 40000;

  const area = areaM2(ancho, alto);
  const perimetro = perimetroM(ancho, alto);
  const altoM = alto / 100;

  const advertencias: string[] = [];
  const items = [];

  // Camino por DISEÑO concreto (espejo flotante, elevado o con marco): el
  // despiece trae la medida de corte real del espejo y de los tubulares, en vez
  // de asumir que el espejo ocupa todo el vano.
  if (input.disenoId) {
    const porDiseno = cotizarPorDiseno({
      disenoId: input.disenoId,
      anchoCm: ancho,
      altoCm: alto,
      // Un espejo no se mete en un hueco de obra: la medida que da el vendedor
      // ES el espejo. No hay holgura de instalación que descontar.
      medidaEs: "fabricacion",
      tipoObra: "fachadas",
      // El catálogo sólo tiene un código de espejo (ES0001), así que es el que
      // se cobra por m² sea cual sea la variante del diseño.
      codigoVidrio: "ES0001",
      segmentoCliente,
      cantidadPiezas: cantPiezas,
      descuentoPct: descuento,
      accesorios: ({ segmentoCliente: seg, cortes, advertencias: adv }) => {
        const lineas: LineaBOM[] = [];
        // El pulido de borde se cobra sobre el perímetro REAL del espejo cortado,
        // no sobre el del vano.
        if (acabado === "BPB") {
          const perimetroReal = (cortes.vidrios || []).reduce(
            (acc, v) => acc + 2 * ((v.anchoMm + v.altoMm) / 1000) * v.cantidad,
            0
          );
          if (perimetroReal > 0) {
            lineas.push(lineaCatalogo("BPB04", round2(perimetroReal), seg, { unidadOverride: "ML" }));
          }
        } else {
          // Mismo criterio que en el camino de medidas libres: el bisel no
          // lleva BPB pero sí cuesta más. Aquí el recargo se calcula sobre el
          // área REAL de los paños cortados, no sobre el vano.
          const areaReal = (cortes.vidrios || []).reduce(
            (acc, v) => acc + ((v.anchoMm / 1000) * (v.altoMm / 1000)) * v.cantidad,
            0
          );
          const precioEspejo = getPrecio("ES0001", seg);
          if (areaReal > 0 && precioEspejo !== null) {
            lineas.push(
              lineaManual({
                codigo: "ESP02",
                descripcion: "Recargo por espejo biselado",
                categoria: "ACABADO",
                unidad: "M2",
                cantidad: 1,
                precioUnitario: round2(areaReal * precioEspejo * (RECARGO_BISELADO - 1)),
              })
            );
          }
          adv.push(
            "Acabado biselado: no se cobra BPB porque el bisel ya trata el borde, pero sí el " +
              "recargo del 15,07% (diferencial ESP02/ESP01 del Excel matriz)."
          );
        }
        return lineas;
      },
    });
    if (porDiseno) {
      porDiseno.advertencias = [...advertencias, ...porDiseno.advertencias];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó con medidas libres.`);
  }

  // Espejo base (área). El catálogo maestro solo tiene un código de espejo
  // (ES0001, con precio real por segmento PA/PM/PB); el biselado no tiene SKU
  // propio, así que se cobra ES0001 y, si el acabado es biselado, el recargo
  // aparte (ver RECARGO_BISELADO).
  const lineaEspejo = lineaCatalogo("ES0001", area, segmentoCliente, { unidadOverride: "M2" });
  items.push(lineaEspejo);

  if (acabado === "BPB") {
    // BPB solo aplica a la variante normal/flotante: el biselado ya incluye su
    // propio tratamiento de borde y no genera este cargo adicional (regla
    // documentada en espejo.md, sección 5).
    items.push(lineaCatalogo("BPB04", perimetro, segmentoCliente, { unidadOverride: "ML" }));
  } else {
    // El bisel no lleva BPB (ya trata el borde), pero SÍ cuesta más que el
    // espejo plano: se cobra el diferencial ESP02/ESP01 del Excel sobre el
    // precio segmentado del espejo, como línea propia y visible en el BOM.
    const recargo = round2(lineaEspejo.valorTotal * (RECARGO_BISELADO - 1));
    if (recargo > 0) {
      items.push(
        lineaManual({
          codigo: "ESP02",
          descripcion: "Recargo por espejo biselado",
          categoria: "ACABADO",
          unidad: "M2",
          cantidad: 1,
          precioUnitario: recargo,
        })
      );
    }
    advertencias.push(
      "Acabado BISELADO: no se carga BPB adicional (el bisel ya incluye el tratamiento de borde). " +
        "El catálogo maestro todavía no tiene un SKU propio de espejo biselado, así que se cobra el " +
        "espejo estándar (ES0001) más un recargo del 15,07% — el diferencial real entre ESP02 ($168.000) " +
        "y ESP01 ($146.000) de la tabla ACABADOS del Excel. Conviene crear el SKU dedicado con sus " +
        "precios PA/PM/PB reales para dejar de derivarlo."
    );
  }

  if (cantTubular > 0) {
    // Metros de tubular T-76: dos lados verticales del marco por cada soporte
    // solicitado (misma fórmula que J11 en espejo.md: (2*alto)*cantTubular).
    const metrosTubular = round2(2 * altoM * cantTubular);
    items.push(lineaCatalogo("TUB0302", metrosTubular, segmentoCliente, { unidadOverride: "ML" }));
  }

  // Servicio Mínimo de Obra: si el valor por área ($58.000/m²) supera la tarifa
  // mínima se cobra ese valor; si no, se cobra la tarifa mínima plana (regla de
  // K12 en espejo.md). Como ancho/alto son obligatorios (>0), el área siempre es
  // > 0, así que el SMO nunca es $0 en este módulo.
  const smoBase = round2(area * smoRate);
  const smoValor = Math.max(smoBase, smoRate);
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
