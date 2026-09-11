// Módulo "Cabinas Batientes" — cabinas de baño en vidrio con puerta batiente (abisagrada)
// + panel fijo lateral.
//
// DECISIÓN DE PRODUCTO (confirmada con el cliente, ver analisis-para-webapp/modulos/
// cabinas_batientes.md): en el Excel original este módulo era un CATÁLOGO DE
// CONFIGURACIONES FIJAS (3 espesores × 6-8 rangos de ancho × 2 altos, cada una con un
// checkbox y un BOM ya congelado — bug #11: nada impedía marcar varios checkboxes a la
// vez). Aquí se PARAMETRIZA a medidas libres: el vendedor escribe ancho/alto reales en
// cm y el motor calcula cada cantidad con fórmulas continuas.
//
// Hallazgo clave al generalizar (ver sección 6 del análisis): la hoja original reparte
// el ancho total de la cabina en 2 paños — una hoja de puerta de ancho ~fijo (0.6m, o
// 0.5m para la abertura más angosta) y un panel fijo que absorbe el resto del ancho.
// Se verificó que, tomando puertaAnchoM = min(anchoTotalM, 0.60):
//   areaPuerta + areaFijo == anchoTotalM * altoM   (exacto, sin desperdicio de vidrio)
//   perimetroPuerta + perimetroFijo == ml de BPB documentados en el Excel, EXACTO para
//   los 6 rangos de ancho de la tabla de 6mm (81-90 hasta 121-130, alto 180cm).
// Esto confirma que BPB en Cabinas Batientes es el perímetro COMPLETO de ambos paños
// (a diferencia de una cabina corrediza, aquí no hay traslape ni borde embebido en
// riel: puerta y panel fijo están enmarcados por bisagras/chapetas en todo su borde).

import { lineaCatalogo, totalizar, round2 } from "../lib/motorCalculo";
import { getParametros } from "../lib/catalogo";
import { cotizarPorDiseno } from "../lib/cotizarPorDiseno";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

// Línea de BOM "manual" (sin código de catálogo) para cargos fijos de instalación
// (SMO, flete), centralizados en server/src/data/parametros.json — mismo patrón
// que ventanas.js/proyectantes.js/cabinasCorredizas.js/tablero.js/espejo.js.
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
  nombre: "Cabinas batientes",
  descripcion:
    "Cabina de baño en vidrio templado con puerta batiente (abisagrada) + panel fijo, a medida libre.",
  campos: [
    // "...Cm" en el nombre por compatibilidad con calcular(); la etiqueta en mm
    // es sólo presentación — el frontend convierte antes de enviar el valor.
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto (mm)", requerido: true, grupo: "medidas" },
    {
      nombre: "espesorVidrioMm",
      tipo: "select",
      opciones: [6, 8, 10],
      etiqueta: "Espesor de vidrio (mm)",
      requerido: true,
      grupo: "vidrio",
    },
    {
      nombre: "tipoBisagra",
      tipo: "select",
      opciones: [
        { value: "sencilla", label: "Bisagra sencilla cromo 28-40" },
        { value: "doble", label: "Bisagra doble cromo 90" },
      ],
      etiqueta: "Tipo de bisagra",
      requerido: false,
      grupo: "vidrio",
    },
    {
      nombre: "tipoChapeta",
      tipo: "select",
      opciones: [
        { value: "economica", label: "Chapeta central importada económica" },
        { value: "cromo3035", label: "Chapeta central cromo 30-35" },
        { value: "cromo90", label: "Chapeta cromo a 90°" },
      ],
      etiqueta: "Tipo de chapeta",
      requerido: false,
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
      ],
      etiqueta: "Tipo de botón/haladera",
      requerido: false,
      grupo: "vidrio",
    },
  ],
};

const VIDRIO_POR_ESPESOR = { 6: "CL6MM03SP", 8: "CL8MM03SP", 10: "CL10MM03SP" };
const BPB_POR_ESPESOR = { 6: "BPB04", 8: "BPB05", 10: "BPB10" };

const BISAGRA_POR_TIPO = { sencilla: "BSE0301", doble: "BDO0302" };
const CHAPETA_POR_TIPO = { economica: "CCE0302", cromo3035: "CCE0301", cromo90: "CHA0303" };
const BOTON_POR_TIPO = {
  tamborCromo: "BHA0302",
  bolaCromo: "BHA0301",
  tamborAcero: "BHA1101",
  tamborAceroTapa: "BHA1102",
};

// Ancho estándar de la hoja de puerta batiente (m). Si el ancho total de la cabina es
// menor a esto, la cabina es de una sola hoja (sin panel fijo).
const PUERTA_ANCHO_ESTANDAR_M = 0.6;

export function calcular(input: InputModulo) {
  const {
    segmentoCliente,
    cantidadPiezas = 1,
    descuentoPct = 0,
    anchoCm,
    altoCm,
    espesorVidrioMm = 6,
    tipoBisagra = "sencilla",
    tipoChapeta = "economica",
    tipoBoton = "tamborCromo",
  } = input;

  if (!anchoCm || anchoCm <= 0) throw new Error("El ancho (cm) debe ser un número mayor a 0.");
  if (!altoCm || altoCm <= 0) throw new Error("El alto (cm) debe ser un número mayor a 0.");

  const vidrioCodigo = VIDRIO_POR_ESPESOR[espesorVidrioMm as keyof typeof VIDRIO_POR_ESPESOR];
  const bpbCodigo = BPB_POR_ESPESOR[espesorVidrioMm as keyof typeof BPB_POR_ESPESOR];
  if (!vidrioCodigo || !bpbCodigo) {
    throw new Error(`Espesor de vidrio "${espesorVidrioMm}mm" no soportado en cabinas batientes (usar 6, 8 o 10).`);
  }
  const bisagraCodigo = BISAGRA_POR_TIPO[tipoBisagra as keyof typeof BISAGRA_POR_TIPO];
  const chapetaCodigo = CHAPETA_POR_TIPO[tipoChapeta as keyof typeof CHAPETA_POR_TIPO];
  const botonCodigo = BOTON_POR_TIPO[tipoBoton as keyof typeof BOTON_POR_TIPO];
  if (!bisagraCodigo) throw new Error(`Tipo de bisagra "${tipoBisagra}" no reconocido.`);
  if (!chapetaCodigo) throw new Error(`Tipo de chapeta "${tipoChapeta}" no reconocido.`);
  if (!botonCodigo) throw new Error(`Tipo de botón "${tipoBoton}" no reconocido.`);

  const advertencias: string[] = [];

  // Camino por DISEÑO concreto (Z_CABINA, Z1_CABINA, PP_PLEGABLE…). El despiece
  // trae el tamaño real de la hoja y del panel fijo, en vez de asumir que la
  // puerta mide siempre 0,60 m como hace el cálculo libre de abajo.
  if (input.disenoId) {
    const UMBRAL_ANCHO_ESCALON = 116;
    const UMBRAL_ALTO_BISAGRA_EXTRA = 190;
    const cantidadBoquillaChapeta = anchoCm >= UMBRAL_ANCHO_ESCALON ? 3 : 2;
    const cantidadBisagras = altoCm > UMBRAL_ALTO_BISAGRA_EXTRA ? 3 : 2;

    const porDiseno = cotizarPorDiseno({
      disenoId: input.disenoId,
      anchoCm,
      altoCm,
      medidaEs: input.medidaEs,
      holguraAnchoMm: input.holguraAnchoMm,
      holguraAltoMm: input.holguraAltoMm,
      codigoVidrio: vidrioCodigo,
      segmentoCliente,
      cantidadPiezas,
      descuentoPct,
      accesorios: ({ segmentoCliente: seg, perimetroVidrioM }) => {
        const lineas: LineaBOM[] = [];
        // En una cabina batiente todos los bordes quedan a la vista, así que el
        // BPB va sobre el perímetro completo de cada paño ya cortado.
        if (perimetroVidrioM > 0) lineas.push(lineaCatalogo(bpbCodigo, round2(perimetroVidrioM), seg));
        lineas.push(lineaCatalogo("BOQN02", cantidadBoquillaChapeta, seg));
        lineas.push(lineaCatalogo(chapetaCodigo, cantidadBoquillaChapeta, seg));
        lineas.push(lineaCatalogo("PERF01", 5, seg));
        lineas.push(lineaCatalogo(bisagraCodigo, cantidadBisagras, seg));
        lineas.push(lineaCatalogo(botonCodigo, 1, seg));
        return lineas;
      },
    });
    if (porDiseno) {
      if (cantidadBisagras === 3) {
        advertencias.push(
          `Alto > ${UMBRAL_ALTO_BISAGRA_EXTRA}cm: se asumieron 3 bisagras en vez de 2; verificar con el equipo técnico.`
        );
      }
      porDiseno.advertencias = [...advertencias, ...porDiseno.advertencias];
      return porDiseno;
    }
    advertencias.push(`El diseño "${input.disenoId}" no existe: se calculó con medidas libres.`);
  }

  // --- 1. VIDRIO: puerta + panel fijo -------------------------------------------
  // La hoja de puerta tiene un ancho ~fijo (0.60m); si la cabina es más angosta que
  // eso, la puerta ocupa todo el ancho y no hay panel fijo. El resto del ancho (si lo
  // hay) se asigna al panel fijo. Ambos paños comparten el mismo alto.
  const anchoTotalM = round2(anchoCm / 100);
  const altoM = round2(altoCm / 100);
  const puertaAnchoM = Math.min(anchoTotalM, PUERTA_ANCHO_ESTANDAR_M);
  const fijoAnchoM = round2(Math.max(anchoTotalM - puertaAnchoM, 0));

  const areaPuerta = round2(puertaAnchoM * altoM);
  const areaFijo = round2(fijoAnchoM * altoM);
  const areaVidrioTotal = round2(areaPuerta + areaFijo); // == areaM2(anchoCm, altoCm), sin desperdicio

  const items = [];
  // Se agrupan puerta+fijo en una sola línea de catálogo porque comparten el mismo
  // código de vidrio (mismo espesor/color); el desglose puerta/fijo se usa internamente
  // solo para calcular el BPB de cada paño por separado.
  items.push(lineaCatalogo(vidrioCodigo, areaVidrioTotal, segmentoCliente));
  if (fijoAnchoM === 0) {
    advertencias.push(
      `Ancho ≤ ${PUERTA_ANCHO_ESTANDAR_M * 100}cm: la cabina se calculó como una sola hoja de puerta, sin panel fijo lateral.`
    );
  }

  // --- 2. BPB (borde pulido brillado): perímetro completo de ambos paños --------
  // Verificado contra el Excel original: BPB_ml = perímetro(puerta) + perímetro(fijo),
  // sin excluir ningún borde (a diferencia de la corrediza, aquí ambos paños están
  // enmarcados por bisagra/chapeta en todo su contorno, no hay riel que embeba un lado).
  const perimetroPuerta = round2(2 * (puertaAnchoM + altoM));
  const perimetroFijo = fijoAnchoM > 0 ? round2(2 * (fijoAnchoM + altoM)) : 0;
  const perimetroBpbTotal = round2(perimetroPuerta + perimetroFijo);
  items.push(lineaCatalogo(bpbCodigo, perimetroBpbTotal, segmentoCliente));

  // --- 3. Accesorios que SÍ escalan con el ancho (documentado en el Excel) ------
  // Regla de negocio real (sección 7.7 del análisis): boquilla y chapeta central
  // pasan de 2 a 3 unidades cuando el ancho llega a 116cm en adelante. Se mantiene
  // el mismo umbral, ahora como comparación continua contra el ancho real.
  const UMBRAL_ANCHO_ESCALON = 116;
  const cantidadBoquillaChapeta = anchoCm >= UMBRAL_ANCHO_ESCALON ? 3 : 2;
  items.push(lineaCatalogo("BOQN02", cantidadBoquillaChapeta, segmentoCliente));
  items.push(lineaCatalogo(chapetaCodigo, cantidadBoquillaChapeta, segmentoCliente));

  // --- 4. Perforación: cantidad fija documentada --------------------------------
  items.push(lineaCatalogo("PERF01", 5, segmentoCliente));

  // --- 5. Bisagras: cantidad fija documentada (2), con umbral de alto ------------
  // El Excel solo documenta 2 bisagras para alto 180/190cm (únicos altos tabulados).
  // Se generaliza con un umbral de ingeniería razonable para alturas fuera de ese
  // rango: cabinas de más de 190cm de alto usan 3 bisagras en vez de 2 (mayor peso
  // de vidrio por hoja). Esto NO está documentado en el Excel original — es un
  // supuesto de generalización, dejado explícito aquí y en advertencias.
  const UMBRAL_ALTO_BISAGRA_EXTRA = 190;
  const cantidadBisagras = altoCm > UMBRAL_ALTO_BISAGRA_EXTRA ? 3 : 2;
  items.push(lineaCatalogo(bisagraCodigo, cantidadBisagras, segmentoCliente));
  if (cantidadBisagras === 3) {
    advertencias.push(
      `Alto > ${UMBRAL_ALTO_BISAGRA_EXTRA}cm: se asumieron 3 bisagras en vez de 2 (el Excel original solo documentaba 2 bisagras, ` +
        "para alturas de 180/190cm); verificar con el equipo técnico si este umbral es el correcto."
    );
  }

  // --- 6. Botón/haladera: cantidad fija documentada (1) -------------------------
  items.push(lineaCatalogo(botonCodigo, 1, segmentoCliente));

  // --- 7. Cargos fijos de mano de obra / flete ----------------------------------
  // Igual que en Cabinas Corredizas: SMO01 (~$87.000) y GTFA26 (~$25.000) se sumaban
  // siempre en el Excel original, pero ninguno de los 2 códigos existe en el catálogo
  // digitalizado de 430 productos (se resolvían desde la tabla ACABADOS, no migrada).
  // Decisión de producto: centralizarlos como valores fijos en parametros.json (mismo
  // patrón que los demás módulos) en vez de omitirlos.
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

  // --- 8. Ítems opcionales del Excel excluidos del cálculo por defecto ----------
  // Toalleros y matizados venían con cantidad 0 por defecto en el Excel (add-ons que
  // el vendedor activaba a mano); el perfil acrílico (PER0901/PER0902) respondía a una
  // selección de tramo de stock (1.8m o 1.20m) sin una fórmula física clara y no forma
  // parte del "kit por defecto" documentado (sección 6/8 del análisis) — no se incluyen
  // aquí; deben agregarse como ítem aparte si el vendedor los necesita.

  const resultado = totalizar(items, {
    cantidadPiezas,
    descuentoPct,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });
  return { ...resultado, areaM2: areaVidrioTotal, advertencias };
}
