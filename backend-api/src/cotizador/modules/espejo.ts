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
//
// PRECIO DEL ESPEJO (decisión del usuario, 2026-09-26): cada acabado es un
// producto propio, cobrado por m², y NINGUNO lleva línea de BPB aparte:
//   - BPB → ES0001, vinculado en el catálogo maestro a ESP4BPB "ESPEJO 4MM BPB";
//     su costo lo pone Proveedores (RAPI VIDRIOS, $55.200/m² al 2026-09-26) y
//     ese precio YA trae el borde pulido brillado. Hasta ese día el módulo sumaba
//     además `BPB04` por el perímetro: el borde se cobraba dos veces (~$27.000
//     de más en 1 m² PM).
//   - BISELADO → ESP4MMBPB "ESPEJO 4MM BISELADO" por m². Hasta ese día se cobraba
//     ES0001 + un recargo del 15,07% (ESP02/ESP01 del Excel), y como ES0001 bajó
//     con el costo real del proveedor el biselado salía MÁS BARATO que el BPB.
//
// SOPORTE TUBULAR (decisión del usuario, 2026-09-28): `tubularCantidad` sólo
// cuenta SIN diseño (TUB0302 por metro, 2 × alto por soporte, fórmula del
// Excel). CON diseño el soporte lo define el despiece y el campo se ignora —el
// formulario lo oculta (CAMPOS_DERIVADOS_DEL_DISENO en el frontend)—:
// ESP_FLOT_1 lleva 2 piezas de T-76 (TUB0302) de (alto − 200 mm), ESP_ELEV_1
// ninguna y ESP_MARCO_1 su marco VP010. Hasta ese día el flotante cobraba el
// T99 provisional y el campo aparecía en pantalla sin mover el precio. Ver
// `2026-09-28_cotizador_espejo_flotante_t76.ts`.
//
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
import { lineaCatalogo, totalizar, areaM2, round2 } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";

const ACABADOS_VALIDOS = ["BPB", "BISELADO"];

/** Producto de catálogo que se cobra por m² según el acabado (ver cabecera). */
const CODIGO_ESPEJO: Record<string, string> = {
  BPB: "ES0001",
  BISELADO: "ESP4MMBPB",
};


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
    // Mano de obra por producto (2026-09-26): no toca el despiece; la lee
    // `calcularManoObraProductos` (lib/cargos.ts) desde el input guardado.
    // Ubicación en la obra (2026-09-26): "Sala", "Baño social". Opcional; no
    // toca el precio. Va al inicio de la descripción comercial del ítem.
    { nombre: "descripcionItem", tipo: "string", etiqueta: "Ubicación (opcional)", requerido: false, grupo: "comercial" },
    { nombre: "conInstalacion", tipo: "boolean", etiqueta: "Con instalación", requerido: false, grupo: "comercial", defecto: true },
    { nombre: "cantidadPiezas", tipo: "number", etiqueta: "Cantidad de piezas iguales", requerido: true, grupo: "comercial" },
    // `descuentoPct` salió del formulario el 2026-09-20: desde entonces hay UN
    // solo descuento y vive en la propuesta (`cotizador.propuesta.descuento_pct`).
    // `calcular()` sigue aceptándolo por compatibilidad con lo ya guardado, pero
    // el formulario deja de pedirlo: en la práctica llega siempre en 0.
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
  const area = areaM2(ancho, alto);
  const altoM = alto / 100;
  const codigoEspejo = CODIGO_ESPEJO[acabado];

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
      // El producto del acabado, por m² de los paños reales cortados. Sin
      // accesorios de borde: los dos productos ya lo traen (ver cabecera).
      codigoVidrio: codigoEspejo,
      segmentoCliente,
      cantidadPiezas: cantPiezas,
      descuentoPct: descuento,
    });
    if (porDiseno) {
      porDiseno.advertencias = [...advertencias, ...porDiseno.advertencias];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó con medidas libres.`);
  }

  // Espejo por m², con el producto de su acabado: el borde (BPB o bisel) ya
  // viene en el precio, así que no hay línea de BPB aparte (ver cabecera).
  items.push(lineaCatalogo(codigoEspejo, area, segmentoCliente, { unidadOverride: "M2" }));

  if (cantTubular > 0) {
    // Metros de tubular T-76: dos lados verticales del marco por cada soporte
    // solicitado (misma fórmula que J11 en espejo.md: (2*alto)*cantTubular).
    const metrosTubular = round2(2 * altoM * cantTubular);
    items.push(lineaCatalogo("TUB0302", metrosTubular, segmentoCliente, { unidadOverride: "ML" }));
  }

  // ⚠️ AQUÍ YA NO SE AGREGAN NI SMO NI FLETE (2026-09-20).
  // `totalizar()` multiplica cada línea del BOM por `cantidadPiezas`: mientras
  // la mano de obra y el flete fueron líneas del ítem, cinco espejos iguales
  // cobraban cinco de cada uno. Los dos pasaron a ser cargos de la PROPUESTA
  // (`cotizador.propuesta_cargo`), se cobran una vez y van fuera del AIU y del
  // descuento.
  //
  // La tarifa que usaba este módulo era la de FACHADAS —la hoja "Espejo" del
  // Excel toma la mano de obra de COSTOS!$AC$33, que es SMO Fachadas: el espejo
  // se instala sobre muro, con el mismo oficio—. Ese criterio no se perdió: vive
  // en el mapa `TIPO_OBRA_POR_MODULO` de `lib/cargos.ts`.

  const resultado = totalizar(items, {
    cantidadPiezas: cantPiezas,
    descuentoPct: descuento,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });

  return { ...resultado, areaM2: area, advertencias };
}
