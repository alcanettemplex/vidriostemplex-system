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
//   - Bug #5 (PELI31 duplicado): no aplica directamente a Espejo (no usa película),
//     pero se documenta el mismo criterio de catálogo único: el catálogo maestro
//     tampoco tiene un código propio para "espejo biselado" (el histórico ESP02 de
//     la tabla ACABADOS del Excel era un precio fijo de $150.000 que nunca llegó a
//     la tabla de costos real por segmento de cliente). Se usa el precio real de
//     ES0001 para ambas variantes y se advierte explícitamente esta limitación
//     (ver advertencias más abajo), en vez de inventar un precio no verificado.
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
import { lineaCatalogo, totalizar, areaM2, perimetroM, round2 } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

const ACABADOS_VALIDOS = ["BPB", "BISELADO"];

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
  const smoRate = parametros.smo?.tarifaMinima ?? 58000;
  const fleteFijo = parametros.flete_fijo ?? 25000;

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
          adv.push("Acabado biselado: no se cobra BPB porque el bisel ya trata el borde.");
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
  // (ES0001, con precio real por segmento PA/PM/PB); no existe un código
  // independiente para "espejo biselado" con precio propio verificado, así que
  // se usa ES0001 para ambas variantes y se advierte la limitación.
  items.push(lineaCatalogo("ES0001", area, segmentoCliente, { unidadOverride: "M2" }));

  if (acabado === "BPB") {
    // BPB solo aplica a la variante normal/flotante: el biselado ya incluye su
    // propio tratamiento de borde y no genera este cargo adicional (regla
    // documentada en espejo.md, sección 5).
    items.push(lineaCatalogo("BPB04", perimetro, segmentoCliente, { unidadOverride: "ML" }));
  } else {
    advertencias.push(
      "Acabado BISELADO: no se carga BPB adicional (el bisel ya incluye el tratamiento de borde). " +
        'El catálogo maestro no tiene un código propio de "espejo biselado" con precio verificado por ' +
        "segmento de cliente (el histórico ESP02 = $150.000 fijo del Excel provenía de una tabla de " +
        "respaldo sin variación PA/PM/PB); se cotiza con el mismo precio de espejo estándar (ES0001). " +
        "Si el negocio requiere un precio distinto para biselado, debe crearse un SKU dedicado en el catálogo."
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
