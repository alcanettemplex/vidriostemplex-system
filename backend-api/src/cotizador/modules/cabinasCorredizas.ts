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
import { getMultiplicador, getParametros } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// `lineaManual()` construía las dos líneas de BOM sin código de catálogo —SMO y
// flete—. Ambas dejaron de ser líneas del ítem el 2026-09-20 y pasaron a ser
// cargos de la propuesta, así que el helper se fue con ellas: dejarlo sin
// llamadores es una invitación a volver a meter cargos en el BOM.

export const meta = {
  nombre: "Cabinas corredizas",
  descripcion:
    "Cabina de baño en vidrio templado con puertas corredizas (deslizantes), a medida libre.",
  campos: [
    // "...Cm" en el nombre por compatibilidad con calcular(); la etiqueta en mm
    // es sólo presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (mm)", requerido: true, grupo: "medidas" },
    {
      nombre: "espesorVidrioMm",
      tipo: "select",
      opciones: [6, 8],
      etiqueta: "Espesor de vidrio (mm)",
      requerido: true,
      grupo: "vidrio",
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
      grupo: "vidrio",
    },
    {
      nombre: "tipoBoton",
      tipo: "select",
      opciones: [
        { value: "tamborCromo", label: "Botón haladera cromo tambor" },
        { value: "bolaCromo", label: "Botón haladera cromo bola" },
        { value: "tamborAcero", label: "Botón haladera acero tambor" },
        { value: "tamborAceroTapa", label: "Botón acero tambor con tapa" },
        { value: "acrilicoTransparente", label: "Botón haladera acrílico transparente" },
      ],
      etiqueta: "Tipo de botón/haladera",
      requerido: false,
      grupo: "vidrio",
    },
    // Mano de obra por producto (2026-09-26): no toca el despiece; la lee
    // `calcularManoObraProductos` (lib/cargos.ts) desde el input guardado.
    // Ubicación en la obra (2026-09-26): "Sala", "Baño social". Opcional; no
    // toca el precio. Va al inicio de la descripción comercial del ítem.
    { nombre: "descripcionItem", tipo: "string", etiqueta: "Ubicación (opcional)", requerido: false, grupo: "comercial" },
    { nombre: "conInstalacion", tipo: "boolean", etiqueta: "Con instalación", requerido: false, grupo: "comercial", defecto: true },
    { nombre: "enL", tipo: "boolean", etiqueta: "Cabina en L (la instalación cuenta doble)", requerido: false, grupo: "comercial" },
    // Cabina Glasvit en L (2026-09-27): se mide X × Y (los dos lados). El lado X
    // es el ancho de arriba; aquí va el Y. `soloSi`: el formulario lo muestra
    // solo con "en L" marcado.
    { nombre: "ladoYCm", tipo: "number", etiqueta: "Lado Y de la L (mm)", requerido: false, grupo: "medidas", soloSi: "enL" },
    {
      nombre: "configuracionL",
      tipo: "select",
      opciones: [
        { value: "2F1C", label: "2 fijos + 1 corrediza" },
        { value: "2F2C", label: "2 fijos + 2 corredizas" },
      ],
      etiqueta: "Cabina Glasvit en L",
      requerido: false,
      grupo: "medidas",
      defecto: "2F1C",
      soloSi: "enL",
    },
  ],
};

// --- Catálogo de vidrio y BPB por espesor ------------------------------------------
const VIDRIO_POR_ESPESOR = { 6: "CL6MM03SP", 8: "CL8MM03SP" };
const BPB_POR_ESPESOR = { 6: "BPB04", 8: "BPB05" };

// Mismas 5 opciones y códigos que cabinasBatientes.ts (mismo accesorio físico,
// duplicado a propósito: cada módulo mantiene sus propios mapas, igual que ya
// hacían VIDRIO_POR_ESPESOR/BPB_POR_ESPESOR arriba).
const BOTON_POR_TIPO = {
  tamborCromo: "BHA0302",
  bolaCromo: "BHA0301",
  tamborAcero: "BHA1101",
  tamborAceroTapa: "BHA1102",
  acrilicoTransparente: "BHA0901",
};

// --- Kits que ya traen las rodachinas ----------------------------------------------
// KIK0301 (kit tubo rectangular) es "todo en uno" y trae las rodachinas: sumar
// además las 4 ROD0401 las cobraba dos veces (confirmado por el usuario,
// 2026-09-25). Rige en los dos caminos: por diseño (Torino, cuyo tubular es
// KIK0301) y por medidas libres con sistema "tubo_rectangular".
// KDG0306 (kit Glasvit) también viene completo (confirmado por el usuario,
// 2026-09-26): hasta ese día se le sumaban las 4 ROD0401.
const KITS_CON_RODACHINAS = new Set(["KIK0301", "KDG0306"]);

// --- Cabina Glasvit (antes "Deslizante Primavera") — reglas del usuario, 2026-09-27 ---
// El kit trae TODOS los herrajes (rodachinas, haladera, anclajes): ni ROD0401
// ni botón. Perforaciones, BPB y boquillas SÍ se cobran (son procesos del
// vidrio; no van a la SAP, ver `itemsParaSap.clasificar`).
//   Recta:  ancho ≤ 1.500 mm → KDG0306; ≤ 2.200 mm → KDG0305; más → KDG0305
//           con aviso ("se cotiza con aviso").
//   En L:   se mide X × Y; un solo kit que ya contempla los dos lados —
//           KDG0302 (2 fijos + 1 corrediza) o KDG0308 (2 fijos + 2 corredizas).
// Tubo TUB0316: largo = el ancho (en L, X + Y). Se cobra por TRAMO de largo, no
// por metro: $37.500 hasta 1.800 mm, $50.000 hasta 2.200, $75.000 hasta 3.000
// y, pasando de 3.000, $75.000 más la fracción adicional (proporcional).
// Los diseños conservan su id "Cabina Deslizante Primavera::…": solo cambió el
// nombre del sistema que se muestra (script 2026-09-27_cotizador_cabina_glasvit).
const KIT_GLASVIT_HASTA_1500 = "KDG0306";
const KIT_GLASVIT_HASTA_2200 = "KDG0305";
const KIT_GLASVIT_EN_L: Record<string, string> = { "2F1C": "KDG0302", "2F2C": "KDG0308" };
const TUBO_GLASVIT = "TUB0316";
const TRAMOS_TUBO_GLASVIT = [
  { hastaMm: 1800, costo: 37500 },
  { hastaMm: 2200, costo: 50000 },
  { hastaMm: 3000, costo: 75000 },
];

const esDisenoGlasvit = (disenoId: unknown) => /PRIMAVERA/i.test(String(disenoId ?? ""));
const marcadoEnL = (v: unknown) => v === true || v === "true";
const mil = (n: number) => Math.round(n).toLocaleString("es-CO");

function kitGlasvit(anchoMm: number, enL: boolean, configuracionL: string, advertencias: string[]): string {
  if (enL) return KIT_GLASVIT_EN_L[configuracionL] ?? KIT_GLASVIT_EN_L["2F1C"];
  if (anchoMm <= 1500) return KIT_GLASVIT_HASTA_1500;
  if (anchoMm > 2200) {
    advertencias.push(
      `Cabina Glasvit de ${mil(anchoMm)} mm de ancho: el kit más grande (KDG0305) es para hasta 2.200 mm. ` +
        "Se cotizó con él; confirmar con el proveedor antes de enviar la cotización."
    );
  }
  return KIT_GLASVIT_HASTA_2200;
}

/** Costo del tubo Glasvit según su largo (tramos del usuario). */
function costoTuboGlasvit(largoMm: number, advertencias: string[]): number {
  const tramo = TRAMOS_TUBO_GLASVIT.find((t) => largoMm <= t.hastaMm);
  if (tramo) return tramo.costo;
  const ultimo = TRAMOS_TUBO_GLASVIT[TRAMOS_TUBO_GLASVIT.length - 1];
  advertencias.push(
    `Tubo Glasvit de ${mil(largoMm)} mm: pasa de 3.000 mm, se cobraron $75.000 más la fracción adicional. ` +
      "Confirmar con el proveedor."
  );
  return round2((ultimo.costo * largoMm) / ultimo.hastaMm);
}

/** Una línea TUB0316 × 1 con el precio del tramo (costo × multiplicador de su
 * categoría para el segmento, igual que cualquier producto del catálogo). */
function lineaTuboGlasvit(largoMm: number, segmentoCliente: string, advertencias: string[]): LineaBOM {
  const base = lineaCatalogo(TUBO_GLASVIT, 1, segmentoCliente);
  if (base.error) return base;
  const multiplicador = getMultiplicador(base.categoria);
  const factor = multiplicador?.[String(segmentoCliente).toLowerCase() as "pa" | "pm" | "pb"];
  if (!factor) {
    advertencias.push(`No hay multiplicador de ${base.categoria} para ${segmentoCliente}: el tubo Glasvit quedó con el precio del catálogo.`);
    return base;
  }
  const tramo = TRAMOS_TUBO_GLASVIT.find((t) => largoMm <= t.hastaMm);
  const precio = round2(costoTuboGlasvit(largoMm, advertencias) * Number(factor));
  return {
    ...base,
    descripcion: `${base.descripcion} (${mil(largoMm)} mm${tramo ? `, tramo hasta ${mil(tramo.hastaMm)} mm` : ""})`,
    precioUnitario: precio,
    valorTotal: precio,
  };
}

/** Lado Y de una cabina Glasvit en L, en mm; error claro si falta. */
function ladoYGlasvit(input: InputModulo): number {
  const y = Number((input as Record<string, unknown>).ladoYCm);
  if (!Number.isFinite(y) || y <= 0) {
    throw new Error("Cabina Glasvit en L: escribe el lado Y (la L se mide X × Y).");
  }
  return y * 10;
}

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
    tipoBoton = "tamborCromo",
  } = input;

  if (!anchoCm || anchoCm <= 0) throw new Error("El ancho (cm) debe ser un número mayor a 0.");
  if (!altoCm || altoCm <= 0) throw new Error("El alto (cm) debe ser un número mayor a 0.");

  const vidrioCodigo = VIDRIO_POR_ESPESOR[espesorVidrioMm as keyof typeof VIDRIO_POR_ESPESOR];
  const bpbCodigo = BPB_POR_ESPESOR[espesorVidrioMm as keyof typeof BPB_POR_ESPESOR];
  if (!vidrioCodigo || !bpbCodigo) {
    throw new Error(`Espesor de vidrio "${espesorVidrioMm}mm" no soportado en cabinas corredizas (usar 6 u 8).`);
  }
  const botonCodigo = BOTON_POR_TIPO[tipoBoton as keyof typeof BOTON_POR_TIPO];
  if (!botonCodigo) throw new Error(`Tipo de botón "${tipoBoton}" no reconocido.`);

  const advertencias: string[] = [];
  const enL = marcadoEnL((input as Record<string, unknown>).enL);
  const configuracionL = String((input as Record<string, unknown>).configuracionL ?? "2F1C");

  // Camino por DISEÑO concreto (OX_CABINA, OXO_CABINA, Torino, Primavera…).
  // Sustituye el supuesto del traslape del 10% que usa el cálculo libre de abajo:
  // aquí el tamaño de cada paño sale de la fórmula de despiece, no de un factor.
  if (input.disenoId) {
    const glasvit = esDisenoGlasvit(input.disenoId);
    // Glasvit en L con 2 corredizas: el lado Y es otro fijo + corrediza, con la
    // misma fórmula del diseño sobre la medida Y. Se calcula aparte y se suma.
    const ladoYMm = glasvit && enL ? ladoYGlasvit(input) : 0;
    const ladoYDiseno = glasvit && enL && configuracionL === "2F2C"
      ? cotizarPorDiseno({
          disenoId: input.disenoId,
          anchoCm: ladoYMm / 10,
          altoCm,
          medidaEs: input.medidaEs,
          tipoObra: "cabinas",
          holguraAnchoMm: input.holguraAnchoMm,
          holguraAltoMm: input.holguraAltoMm,
          codigoVidrio: vidrioCodigo,
          segmentoCliente,
        })
      : null;
    const porDiseno = cotizarPorDiseno({
      disenoId: input.disenoId,
      anchoCm,
      altoCm,
      // En cabina el "vano" es el nicho del baño: también hay holgura, y aquí
      // importa más que en ventanería porque el muro rara vez está a plomo.
      medidaEs: input.medidaEs,
      tipoObra: "cabinas",
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
        // Glasvit: el BPB se calcula al final (`ajustarItems`), cuando ya están
        // también los vidrios del lado Y de la L.
        const metrosBpb = glasvit ? 0 : (cortes.vidrios || []).reduce(
          (acc, v) => acc + ((2 * v.altoMm + v.anchoMm) / 1000) * v.cantidad,
          0
        );
        if (metrosBpb > 0) lineas.push(lineaCatalogo(bpbCodigo, round2(metrosBpb), seg));
        if (glasvit) {
          // El kit trae rodachinas, haladera y anclajes: solo los procesos del
          // vidrio. Con 2 corredizas en L, el doble de perforaciones y boquillas.
          const factorL = enL && configuracionL === "2F2C" ? 2 : 1;
          lineas.push(lineaCatalogo("PERF01", 2 * factorL, seg));
          lineas.push(lineaCatalogo("BOQN02", 2 * factorL, seg));
          return lineas;
        }
        // Herrajes: mismas cantidades que el cálculo libre, que son las que ya
        // estaban en uso. No se derivan del diseño porque el catálogo de diseños
        // no trae accesorios con precio en Templex.
        const kitTraeRodachinas = (cortes.perfiles || []).some(
          (c) => typeof c.codigo === "string" && KITS_CON_RODACHINAS.has(c.codigo)
        );
        if (!kitTraeRodachinas) lineas.push(lineaCatalogo("ROD0401", 4, seg));
        lineas.push(lineaCatalogo("PERF01", 2, seg));
        lineas.push(lineaCatalogo("BOQN02", 2, seg));
        lineas.push(lineaCatalogo(botonCodigo, 1, seg));
        return lineas;
      },
      ajustarItems: glasvit
        ? (items, ctx) => {
            const avisos = ctx.advertencias;
            // Lado Y de la L: vidrios y tubo.
            if (enL) {
              const yFabMm = Math.max(ladoYMm - ctx.holgura.anchoMm, 0);
              if (ladoYDiseno) {
                ctx.cortes.vidrios.push(...(ladoYDiseno.cortes?.vidrios ?? []).map((v) => ({ ...v, lado: "Y" })));
              } else {
                const altoMm = Math.round(ctx.altoCm * 10);
                ctx.cortes.vidrios.push({
                  descripcion: ctx.cortes.vidrios[0]?.descripcion ?? null,
                  anchoMm: yFabMm,
                  altoMm,
                  cantidad: 1,
                  areaM2: round2((yFabMm / 1000) * (altoMm / 1000)),
                  nivelRiesgo: "B_DIVISION_LIMPIA",
                  incertidumbreMm: 1,
                  lado: "Y",
                });
              }
              avisos.push(
                "Cabina Glasvit en L: el vidrio del lado Y se calculó sobre la medida del lado menos la holgura; " +
                  "verificar en obra el encuentro de la esquina antes de pedir el vidrio."
              );
              const tuboX = ctx.cortes.perfiles.find((c) => c.codigo === TUBO_GLASVIT);
              if (tuboX) ctx.cortes.perfiles.push({ ...tuboX, medidaMm: yFabMm, piezasEnteras: 0, lado: "Y" });
            }
            // Vidrio: el despiece solo midió el lado X; el área sale de todos los paños.
            const areaVidrio = round2(
              ctx.cortes.vidrios.reduce((a, v) => a + (v.anchoMm / 1000) * (v.altoMm / 1000) * v.cantidad, 0)
            );
            const metrosBpb = round2(
              ctx.cortes.vidrios.reduce((a, v) => a + ((2 * v.altoMm + v.anchoMm) / 1000) * v.cantidad, 0)
            );
            // Tubo: una sola pieza (en L, doblada) por tramo de largo.
            const tubos = ctx.cortes.perfiles.filter((c) => c.codigo === TUBO_GLASVIT);
            const largoTubo = tubos.reduce((a, c) => a + c.medidaMm * (c.cantidad || 1), 0);
            if (tubos[0]) tubos[0].piezasEnteras = 1;

            const salida: LineaBOM[] = [];
            for (const l of items) {
              if (l.codigo === TUBO_GLASVIT) continue;
              if (l.codigo === vidrioCodigo && enL) {
                salida.push(lineaCatalogo(vidrioCodigo, areaVidrio, ctx.segmentoCliente));
                continue;
              }
              salida.push(l);
            }
            if (largoTubo > 0) salida.push(lineaTuboGlasvit(largoTubo, ctx.segmentoCliente, avisos));
            if (metrosBpb > 0) salida.push(lineaCatalogo(bpbCodigo, metrosBpb, ctx.segmentoCliente));
            salida.push(lineaCatalogo(kitGlasvit(Math.round(anchoCm * 10), enL, configuracionL, avisos), 1, ctx.segmentoCliente));
            return salida;
          }
        : undefined,
    });
    if (porDiseno) {
      porDiseno.advertencias = [
        ...advertencias,
        glasvit
          ? "Cabina Glasvit: el kit trae los herrajes (rodachinas, haladera y anclajes); se cobran aparte solo los procesos del vidrio."
          : "Cantidades de rodachinas, perforación, boquilla y botón tomadas como valores típicos: el catálogo de diseños no trae accesorios con precio propio.",
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
  const esGlasvitLibre = tipoSistema === "glasvit";
  const ladoYLibreMm = esGlasvitLibre && enL ? ladoYGlasvit(input) : 0;
  const areaAbertura = areaM2(anchoCm, altoCm);
  // En L (Glasvit): el lado Y suma un fijo (2F1C) o un fijo + corrediza (2F2C).
  const areaLadoY = ladoYLibreMm > 0
    ? areaM2(ladoYLibreMm / 10, altoCm) * (configuracionL === "2F2C" ? FACTOR_TRASLAPE_PANELES : 1)
    : 0;
  const areaVidrioTotal = round2(areaAbertura * FACTOR_TRASLAPE_PANELES + areaLadoY);
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
  const perimetroBpbLadoY = ladoYLibreMm > 0
    ? (configuracionL === "2F2C"
        ? 2 * (2 * altoM + round2((ladoYLibreMm / 1000) * 0.55))
        : 2 * altoM + ladoYLibreMm / 1000)
    : 0;
  const perimetroBpbTotal = round2(perimetroBpbUnPanel * 2 + perimetroBpbLadoY);
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
      // Kit deslizante Glasvit: "todo en uno" (herrajes incluidos). Kit y tubo
      // según las reglas de 2026-09-27 (ver KIT_GLASVIT_* y TRAMOS_TUBO_GLASVIT).
      items.push(lineaTuboGlasvit(Math.round(anchoCm * 10) + ladoYLibreMm, segmentoCliente, advertencias));
      items.push(lineaCatalogo(kitGlasvit(Math.round(anchoCm * 10), enL, configuracionL, advertencias), 1, segmentoCliente));
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
  // 2 rodachinas por paño × 2 paños — salvo que el kit del sistema ya las traiga.
  // Glasvit: el kit trae rodachinas y haladera (2026-09-27).
  const kitTraeRodachinas = esGlasvitLibre || items.some((l) => KITS_CON_RODACHINAS.has(l.codigo));
  const factorPerforaciones = esGlasvitLibre && enL && configuracionL === "2F2C" ? 2 : 1;
  if (!kitTraeRodachinas) items.push(lineaCatalogo("ROD0401", 4, segmentoCliente));
  items.push(lineaCatalogo("PERF01", 2 * factorPerforaciones, segmentoCliente)); // perforación para halador, 1 por paño móvil
  items.push(lineaCatalogo("BOQN02", 2 * factorPerforaciones, segmentoCliente)); // boquilla cubre-perforación
  if (!esGlasvitLibre) items.push(lineaCatalogo(botonCodigo, 1, segmentoCliente)); // botón haladera del paño móvil, según tipoBoton
  advertencias.push(
    "Cantidades de rodachinas, perforación y boquilla se tomaron como valores fijos típicos " +
      "(no había una tabla de cantidades explícita para estos ítems en el análisis del Excel de Cabinas Corredizas); " +
      "ajustar si el equipo técnico define otra cantidad estándar."
  );

  if (espesorVidrioMm === 6) {
    // Perfil plástico protector de borde, específico para vidrio de 6mm según su
    // nombre en el catálogo ("PERFIL PLASTICO 6MM").
    items.push(lineaCatalogo("PPL0001", 1, segmentoCliente));
  }

  // --- 5. Cargos de obra: YA NO VIVEN AQUÍ (2026-09-20) -------------------------
  // El Excel original sumaba siempre SMO01 (mano de obra) y GTFA26 (flete) como
  // dos líneas más, y así se portaron. El problema es que `totalizar()`
  // multiplica cada línea del BOM por `cantidadPiezas`: cinco cabinas iguales
  // cobraban cinco manos de obra y cinco fletes, y cada ítem del carrito traía
  // los suyos. Ambos pasaron a ser cargos de la PROPUESTA
  // (`cotizador.propuesta_cargo`): se cobran una vez, van fuera del AIU y fuera
  // del descuento, y su sugerencia se calcula en `lib/cargos.ts`.
  //
  // La tarifa que le tocaba a este módulo —SMO01, "cabinas", la obra más cara de
  // instalar— no se perdió: vive en `TIPO_OBRA_POR_MODULO` de `lib/cargos.ts`.
  const parametros = getParametros();

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
