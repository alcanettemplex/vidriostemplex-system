// Módulo "Cabinas Corredizas" — cabinas de baño en vidrio con puertas deslizantes.
//
// DECISIÓN DE PRODUCTO (confirmada con el cliente, ver analisis-para-webapp/modulos/
// cabinas_corredizas.md): en el Excel original este módulo era un CATÁLOGO DE 56
// CONFIGURACIONES FIJAS (4 líneas de producto × 7 rangos de ancho × 2 altos), cada una
// con un checkbox y un BOM ya congelado en la plantilla (bug #11: nada impedía marcar
// varios checkboxes a la vez). Aquí se PARAMETRIZA a medidas libres: el vendedor escribe
// ancho/alto reales en cm y el motor calcula cada cantidad con fórmulas continuas,
// generalizando los patrones observados en las 56 configuraciones originales.
//
// Los 4 "sistemas" documentados en el Excel (una tabla de BOM por línea de producto) se
// mantienen como opciones de `tipoSistema`, pero ahora el espesor de vidrio se puede
// combinar libremente con cualquiera de los 4 (en el Excel cada sistema traía un único
// espesor fijo; ver advertencias que se generan cuando se usa una combinación que el
// Excel original no tabulaba).

import { lineaCatalogo, totalizar, areaM2, perimetroM, round2 } from "../lib/motorCalculo";
import { getParametros } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// Línea de BOM "manual" (sin código de catálogo) para cargos fijos de instalación
// (SMO, flete), centralizados en server/src/data/parametros.json — mismo patrón
// que ventanas.js/proyectantes.js/tablero.js/espejo.js.
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
  nombre: "Cabinas corredizas",
  descripcion:
    "Cabina de baño en vidrio templado con puertas corredizas (deslizantes), a medida libre.",
  campos: [
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (cm)", requerido: true },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (cm)", requerido: true },
    {
      nombre: "espesorVidrioMm",
      tipo: "select",
      opciones: [6, 8],
      etiqueta: "Espesor de vidrio (mm)",
      requerido: true,
    },
    {
      nombre: "tipoSistema",
      tipo: "select",
      opciones: [
        { value: "corrediza", label: "Corrediza estándar (riel superior U32 + sillar)" },
        { value: "glasvit", label: "Glasvit (kit deslizante todo en uno)" },
        { value: "deslizante_pizavidrio", label: "Deslizante pizavidrio (perfil U68 + guía de piso)" },
        { value: "tubo_rectangular", label: "Tubo rectangular (kit todo en uno)" },
      ],
      etiqueta: "Sistema / riel",
      requerido: true,
    },
  ],
};

// --- Catálogo de vidrio y BPB por espesor ------------------------------------------
const VIDRIO_POR_ESPESOR = { 6: "CL6MM03SP", 8: "CL8MM03SP" };
const BPB_POR_ESPESOR = { 6: "BPB04", 8: "BPB05" };

// --- Espesor "original" documentado en el Excel para cada sistema ------------------
// (usado solo para decidir si hay que avisar que la combinación es una extrapolación).
const ESPESOR_ORIGINAL_POR_SISTEMA = {
  corrediza: 6,
  glasvit: 8,
  deslizante_pizavidrio: 6,
  tubo_rectangular: 8,
};

/**
 * Kit de aluminio de marco según el ancho total de la cabina (unidad fija, ml no aplica).
 * Generaliza los 7 rangos de ancho documentados en el Excel (90-96→K1000, 97-100→K1000,
 * 101-116→K1200, 117-120→K1200, 121-136→K1500, 137-140→K1500, 141-150→K2000; K1300 nunca
 * se usó en este módulo) a 4 umbrales continuos.
 */
function kitAluminioPorAncho(anchoCm: number) {
  if (anchoCm <= 100) return "K1000";
  if (anchoCm <= 120) return "K1200";
  if (anchoCm <= 140) return "K1500";
  return "K2000";
}

export function calcular(input: InputModulo) {
  const {
    segmentoCliente,
    cantidadPiezas = 1,
    descuentoPct = 0,
    anchoCm,
    altoCm,
    espesorVidrioMm = 6,
    tipoSistema = "corrediza",
  } = input;

  if (!anchoCm || anchoCm <= 0) throw new Error("El ancho (cm) debe ser un número mayor a 0.");
  if (!altoCm || altoCm <= 0) throw new Error("El alto (cm) debe ser un número mayor a 0.");

  const vidrioCodigo = VIDRIO_POR_ESPESOR[espesorVidrioMm as keyof typeof VIDRIO_POR_ESPESOR];
  const bpbCodigo = BPB_POR_ESPESOR[espesorVidrioMm as keyof typeof BPB_POR_ESPESOR];
  if (!vidrioCodigo || !bpbCodigo) {
    throw new Error(`Espesor de vidrio "${espesorVidrioMm}mm" no soportado en cabinas corredizas (usar 6 u 8).`);
  }

  const advertencias: string[] = [];

  // Camino por DISEÑO concreto (OX_CABINA, OXO_CABINA, Torino, Primavera…).
  // Sustituye el supuesto del traslape del 10% que usa el cálculo libre de abajo:
  // aquí el tamaño de cada paño sale de la fórmula de despiece, no de un factor.
  if (input.disenoId) {
    const porDiseno = cotizarPorDiseno({
      disenoId: input.disenoId,
      anchoCm,
      altoCm,
      // En cabina el "vano" es el nicho del baño: también hay holgura, y aquí
      // importa más que en ventanería porque el muro rara vez está a plomo.
      medidaEs: input.medidaEs,
      holguraAnchoMm: input.holguraAnchoMm,
      holguraAltoMm: input.holguraAltoMm,
      codigoVidrio: vidrioCodigo,
      segmentoCliente,
      cantidadPiezas,
      descuentoPct,
      accesorios: ({ segmentoCliente: seg, cortes }) => {
        const lineas: LineaBOM[] = [];
        // BPB en los dos bordes verticales y el horizontal libre de cada paño
        // (el otro horizontal queda embebido en el riel). Ahora sobre la medida
        // real del paño en vez de un ancho promedio estimado.
        const metrosBpb = (cortes.vidrios || []).reduce(
          (acc, v) => acc + ((2 * v.altoMm + v.anchoMm) / 1000) * v.cantidad,
          0
        );
        if (metrosBpb > 0) lineas.push(lineaCatalogo(bpbCodigo, round2(metrosBpb), seg));
        // Herrajes: mismas cantidades que el cálculo libre, que son las que ya
        // estaban en uso. No se derivan del diseño porque el catálogo de diseños
        // no trae accesorios con precio en Templex.
        lineas.push(lineaCatalogo("ROD0401", 4, seg));
        lineas.push(lineaCatalogo("PERF01", 2, seg));
        lineas.push(lineaCatalogo("BOQN02", 2, seg));
        lineas.push(lineaCatalogo("BHA0302", 1, seg));
        return lineas;
      },
    });
    if (porDiseno) {
      porDiseno.advertencias = [
        ...advertencias,
        "Cantidades de rodachinas, perforación, boquilla y botón tomadas como valores típicos: el catálogo de diseños no trae accesorios con precio propio.",
        ...porDiseno.advertencias,
      ];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó con medidas libres.`);
  }

  // --- 1. VIDRIO ---------------------------------------------------------------
  // Una cabina corrediza tiene 2 paños de vidrio que se traslapan (deslizan uno
  // sobre otro). En la matriz original cada paño mide ~55% del ancho total de la
  // cabina (para permitir el traslape), es decir el área combinada de los 2 paños
  // equivale a ~1.10 × el área de la abertura (ancho×alto). Se verificó este factor
  // contra los valores hardcodeados del Excel (p.ej. bracket 90-96/alto180: paños de
  // 0.5m×1.8m ×2 = 1.8 m² ≈ 1.10 × (0.93m×1.8m); bracket 141-150/alto180: paños de
  // 0.8m×1.8m ×2 = 2.88 m² = 1.10 × (1.455m×1.8m) exacto) y se generalizó a una
  // fórmula continua.
  const FACTOR_TRASLAPE_PANELES = 1.1;
  const areaAbertura = areaM2(anchoCm, altoCm);
  const areaVidrioTotal = round2(areaAbertura * FACTOR_TRASLAPE_PANELES);
  advertencias.push(
    "Área de vidrio calculada para 2 paños corredizos con ~10% de traslape entre ellos " +
      "(fórmula continua generalizada a partir de la proporción observada en la matriz de tamaños del Excel original); " +
      "verificar con el equipo técnico si el traslape real de este sistema difiere."
  );

  const items = [];
  items.push(lineaCatalogo(vidrioCodigo, areaVidrioTotal, segmentoCliente));

  // --- 2. BPB (borde pulido brillado) -------------------------------------------
  // Se asume BPB en los 2 bordes verticales de cada paño y en 1 borde horizontal
  // libre (el otro borde horizontal —superior o inferior según el sistema— queda
  // embebido en el riel superior o en la guía de piso y no requiere pulido).
  // perímetro con BPB de UN paño = 2*alto + ancho_paño ; se usa el mismo ancho de
  // paño promedio (55% del ancho total) que en el cálculo de vidrio, multiplicado
  // por los 2 paños.
  const anchoPanelM = round2((anchoCm / 100) * 0.55);
  const altoM = round2(altoCm / 100);
  const perimetroBpbUnPanel = round2(2 * altoM + anchoPanelM);
  const perimetroBpbTotal = round2(perimetroBpbUnPanel * 2);
  items.push(lineaCatalogo(bpbCodigo, perimetroBpbTotal, segmentoCliente));
  advertencias.push(
    "Se asumió BPB solo en los bordes verticales y en el borde horizontal libre de cada paño móvil " +
      "(el borde que queda embebido en el riel/guía no se pule); verificar con el equipo técnico."
  );

  // --- 3. Perfilería/kit propio del sistema elegido -----------------------------
  const anchoM = round2(anchoCm / 100);
  let incluyeKitAluminioMarco = false;
  switch (tipoSistema) {
    case "corrediza":
      // Riel superior U32 a lo largo de todo el ancho + sillar/carrilera (pieza única).
      items.push(lineaCatalogo("U320101", anchoM, segmentoCliente, { unidadOverride: "ml" }));
      items.push(lineaCatalogo("SIL0101", 1, segmentoCliente));
      incluyeKitAluminioMarco = true;
      break;
    case "glasvit":
      // Kit deslizante Glasvit: accesorio "todo en uno" (rieles+rodachinas incluidos
      // en el kit), cantidad fija 1 por cabina, no escala con el tamaño.
      items.push(lineaCatalogo("KDG0306", 1, segmentoCliente));
      break;
    case "deslizante_pizavidrio":
      // Perfil superior tipo pizavidrio (U68) + guía de piso, ambos a lo largo del
      // ancho total de la cabina.
      items.push(lineaCatalogo("U680101", anchoM, segmentoCliente, { unidadOverride: "ml" }));
      items.push(lineaCatalogo("GPI1102", anchoM, segmentoCliente, { unidadOverride: "ml" }));
      incluyeKitAluminioMarco = true;
      break;
    case "tubo_rectangular":
      // Kit tubo rectangular: también "todo en uno", cantidad fija 1.
      items.push(lineaCatalogo("KIK0301", 1, segmentoCliente));
      break;
    default:
      throw new Error(`Sistema "${tipoSistema}" no reconocido para cabinas corredizas.`);
  }

  // El "Kit Aluminio" (K1000/K1200/K1500/K2000, dimensionado por ancho) solo se suma
  // para los sistemas cuya perfilería documentada NO es ya un kit completo (glasvit y
  // tubo_rectangular ya incluyen su propio marco/rieles en un solo código de kit).
  if (incluyeKitAluminioMarco) {
    const kitCodigo = kitAluminioPorAncho(anchoCm);
    items.push(lineaCatalogo(kitCodigo, 1, segmentoCliente));
    advertencias.push(
      `Kit de aluminio de marco seleccionado por ancho (${kitCodigo}), generalizando los rangos fijos del Excel original a umbrales continuos (≤100→K1000, ≤120→K1200, ≤140→K1500, >140→K2000).`
    );
  }

  // --- 4. Accesorios de cantidad fija (no escalan con el tamaño) ----------------
  // Cantidades típicas asumidas para una cabina corrediza estándar de 2 paños; el
  // Excel original no documentaba una tabla explícita de cantidades para estos ítems
  // en Cabinas Corredizas (a diferencia de Cabinas Batientes), por lo que se tomaron
  // valores de ingeniería razonables y se dejan documentados aquí y en advertencias.
  items.push(lineaCatalogo("ROD0401", 4, segmentoCliente)); // 2 rodachinas por paño × 2 paños
  items.push(lineaCatalogo("PERF01", 2, segmentoCliente)); // perforación para halador, 1 por paño móvil
  items.push(lineaCatalogo("BOQN02", 2, segmentoCliente)); // boquilla cubre-perforación
  items.push(lineaCatalogo("BHA0302", 1, segmentoCliente)); // botón haladera cromo tambor (paño móvil)
  advertencias.push(
    "Cantidades de rodachinas, perforación, boquilla y botón haladera se tomaron como valores fijos típicos " +
      "(no había una tabla de cantidades explícita para estos ítems en el análisis del Excel de Cabinas Corredizas); " +
      "ajustar si el equipo técnico define otra cantidad estándar."
  );

  if (espesorVidrioMm === 6) {
    // Perfil plástico protector de borde, específico para vidrio de 6mm según su
    // nombre en el catálogo ("PERFIL PLASTICO 6MM").
    items.push(lineaCatalogo("PPL0001", 1, segmentoCliente));
  }

  // --- 5. Cargos fijos de mano de obra / flete ----------------------------------
  // El Excel original sumaba siempre SMO01 (mano de obra, ~$87.000) y GTFA26 (flete,
  // ~$25.000). Ninguno de los 2 códigos existe en el catálogo digitalizado de 430
  // productos (se resolvían en el Excel desde la tabla ACABADOS, que no se migró).
  // Decisión de producto: centralizarlos como valores fijos en parametros.json
  // (mismo patrón que ventanas.js/proyectantes.js/tablero.js/espejo.js) en vez de
  // omitirlos.
  const parametros = getParametros();
  const smoRate = parametros.smo?.tarifaMinima ?? 58000;
  const fleteFijo = parametros.flete_fijo ?? 25000;
  const smoValor = Math.max(round2(areaVidrioTotal * smoRate), smoRate);
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

  // --- Advertencia de combinación no documentada en el Excel original -----------
  if (ESPESOR_ORIGINAL_POR_SISTEMA[tipoSistema as keyof typeof ESPESOR_ORIGINAL_POR_SISTEMA] !== espesorVidrioMm) {
    advertencias.push(
      `El Excel original solo documentaba el sistema "${tipoSistema}" con vidrio de ` +
        `${ESPESOR_ORIGINAL_POR_SISTEMA[tipoSistema as keyof typeof ESPESOR_ORIGINAL_POR_SISTEMA]}mm; se generalizó para permitir también ${espesorVidrioMm}mm. ` +
        "Verificar con el equipo técnico si la perfilería/kit de este sistema soporta ese espesor."
    );
  }

  const resultado = totalizar(items, {
    cantidadPiezas,
    descuentoPct,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });
  return { ...resultado, areaM2: areaVidrioTotal, advertencias };
}
