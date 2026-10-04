// División de oficina / Fachada (2026-10-04, pedido del usuario).
//
// Un solo producto con dos decisiones del asesor (decisión del usuario: una
// tarjeta, no cuatro):
//   · TIPO:     solo vidrio  |  enmarcada en aluminio
//   · APERTURA: batiente     |  corrediza
//
// Se mide como el resto del Cotizador: ancho × alto TOTAL más la configuración
// (un solo campo con notación O = fijo, P = puerta, X = corrediza: OPO, OXXO…).
// No hay diseños con despiece para este producto, así que no emite `cortes`:
// la SAP pide los perfiles como "medir en obra" (lib/itemsParaSap.ts) y la
// orden de corte lo trata como SIN_DESPIECE_POR_DISENO, igual que un tablero.
//
// Los materiales y sus cantidades son los que dio y validó el usuario el
// 2026-10-04 (tabla en docs/modulos/cotizador.md → "Pérgola y División /
// Fachada"). Si un material cambia, se cambia aquí y en esa tabla.
//
// Mano de obra: $120.000/m² (`mo_instalacion_division_m2`), una sola tarifa
// para las cuatro variantes; la calcula lib/cargos.ts, nunca este BOM.

import { lineaCatalogo, totalizar, areaM2 } from "../lib/motorCalculo";
import type { LineaBOM } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import { normalizarColor } from "../lib/alfajias";
import type { InputModulo } from "../tipos";

// ─── Códigos ────────────────────────────────────────────────────────────────

/** Perfiles por color. Un color sin código cae a MATE con aviso (mismo criterio
 * que ventanas): nunca se adivina un código. */
const POR_COLOR: Record<string, Record<string, string>> = {
  T244: { mate: "TUB0102", blanco: "TUB0203", crudo: "TUB0312", bronce: "TUB0501", negro: "TUB0604" },
  ADAPTADOR_175: { mate: "SIL0103", blanco: "ADA0404", crudo: "ADA0305", bronce: "SIL0502", "gris plata": "ADA0204" },
  PISAVIDRIO_177: { mate: "PPR0101", blanco: "PIS0405", crudo: "PIS0304", bronce: "PPR0501", "gris plata": "PIS0204" },
  U57: { mate: "U570101", blanco: "U570401", bronce: "U570502" },
  U32: { mate: "U320101", blanco: "U320401", bronce: "U320501" },
  T70: { mate: "TUB0103", blanco: "TUB0409", bronce: "TUB0502", "gris plata": "TUB0211", negro: "TUB0610" },
  BISAGRA_OMEGA: { mate: "BAO0101", bronce: "BAO0301", negro: "BAO0602" },
};
const NOMBRE_PERFIL: Record<keyof typeof POR_COLOR, string> = {
  T244: "El tubular T-244",
  ADAPTADOR_175: "El adaptador 175",
  PISAVIDRIO_177: "El pisavidrio 177",
  U57: "El U-57",
  U32: "El U-32",
  T70: "El tubular T-70",
  BISAGRA_OMEGA: "La bisagra omega",
};

const C = {
  vidrio8: "CL8MM03SP",
  vidrio6: "CL6MM03SP",
  esquineroSuperior: "ESU1102",
  esquineroInferior: "EIN1102",
  zocalo: "ZSE0104",
  topeCazuela: "TCA0301",
  manijaRoma: "MRO1101",
  cerraduraYale: "CER0301",
  escudoYale: "CCE0101",
  recibidorRedondeado: "CRE1301",
  perfilF: "PER0301",
  rielOptiglas: "ROS0301",
  kitOptiglas60: "KOP0102",
  kitOptiglas80: "KOP0101",
  picoloroChapeta: "CPI0101",
  empaqueAntirretractil: "EMP1301",
  yaleMini: "CHE0101",
  rielDucasse: "RDU0101",
  rodamientoDucasse: "RDU0102",
  picoloroIncrustar: "CPLEYALE",
  tiraderaMultiuso: "MMT0101",
};

/** Peso del vidrio templado: 2,5 kg por m² y por mm de espesor. */
const KG_POR_M2_MM = 2.5;
const ESPESOR_CORREDIZA_MM = 6;
const CAPACIDAD_KIT_60 = 60;
const CAPACIDAD_KIT_80 = 80;

// ─── Formulario ─────────────────────────────────────────────────────────────

export const CONFIGURACIONES_BATIENTE = [
  { value: "P", label: "P — 1 puerta" },
  { value: "OP", label: "OP — fijo + puerta" },
  { value: "OPO", label: "OPO — fijo + puerta + fijo" },
  { value: "PP", label: "PP — 2 puertas" },
  { value: "OPPO", label: "OPPO — fijo + 2 puertas + fijo" },
];
export const CONFIGURACIONES_CORREDIZA = [
  { value: "OX", label: "OX — fija + corrediza" },
  { value: "XX", label: "XX — 2 corredizas" },
  { value: "OXO", label: "OXO — fija + corrediza + fija" },
  { value: "OXXO", label: "OXXO — fija + 2 corredizas + fija" },
];

const BATIENTE = [{ campo: "apertura", valores: ["batiente"] }];
const CORREDIZA = [{ campo: "apertura", valores: ["corrediza"] }];
const SOLO_VIDRIO_BATIENTE = [
  { campo: "tipo", valores: ["solo-vidrio"] },
  { campo: "apertura", valores: ["batiente"] },
];

export const meta = {
  nombre: "División / Fachada",
  descripcion:
    "División de oficina o fachada en solo vidrio o enmarcada en aluminio, batiente o corrediza. Ancho × alto total más la composición de puertas, hojas y fijos.",
  campos: [
    {
      nombre: "tipo",
      tipo: "select",
      opciones: [
        { value: "solo-vidrio", label: "Solo vidrio (templado)" },
        { value: "enmarcada", label: "Enmarcada en aluminio" },
      ],
      etiqueta: "Tipo",
      requerido: true,
      grupo: "medidas",
      defecto: "solo-vidrio",
    },
    {
      nombre: "apertura",
      tipo: "select",
      opciones: [
        { value: "batiente", label: "Batiente (puerta que abre)" },
        { value: "corrediza", label: "Corrediza" },
      ],
      etiqueta: "Apertura",
      requerido: true,
      grupo: "medidas",
      defecto: "batiente",
    },
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho total (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Alto total (mm)", requerido: true, grupo: "medidas" },
    // Composición en UN campo (2026-10-04, pedido del usuario: antes eran
    // puertas/fijos/hojas corredizas/hojas fijas, que se leían como datos
    // repetidos). Notación del ERP: O = fijo, P = puerta, X = hoja corrediza.
    // Dos campos porque la lista depende de la apertura; solo se ve uno.
    { nombre: "configuracionBatiente", tipo: "select", opciones: CONFIGURACIONES_BATIENTE, etiqueta: "Configuración", requerido: true, grupo: "medidas", defecto: "OPO", soloSiValor: BATIENTE },
    { nombre: "configuracionCorrediza", tipo: "select", opciones: CONFIGURACIONES_CORREDIZA, etiqueta: "Configuración", requerido: true, grupo: "medidas", defecto: "OX", soloSiValor: CORREDIZA },
    // Opcional: vacío = todas las hojas del mismo ancho.
    { nombre: "anchoPuertaCm", tipo: "number", etiqueta: "Ancho de puerta (mm, opcional)", requerido: false, grupo: "medidas", soloSiValor: BATIENTE },
    {
      nombre: "colorPerfileria",
      tipo: "select",
      opciones: [
        { value: "mate", label: "Mate" },
        { value: "bronce", label: "Bronce" },
        { value: "gris plata", label: "Gris plata" },
        { value: "blanco", label: "Blanco" },
        { value: "crudo", label: "Crudo" },
        { value: "negro", label: "Negro" },
      ],
      etiqueta: "Color de perfilería",
      requerido: true,
      grupo: "vidrio",
      defecto: "mate",
    },
    {
      nombre: "inferiorPuerta",
      tipo: "select",
      opciones: [
        { value: "esquineros", label: "Esquineros superior e inferior" },
        { value: "zocalo", label: "Zócalo inferior" },
      ],
      etiqueta: "Herraje de la puerta",
      requerido: true,
      grupo: "vidrio",
      defecto: "esquineros",
      soloSiValor: SOLO_VIDRIO_BATIENTE,
    },
    {
      nombre: "seguridadPuerta",
      tipo: "select",
      opciones: [
        { value: "yale", label: "Cerradura Yale 170 + chapeta escudo" },
        { value: "recibidor", label: "Chapeta recibidor redondeada" },
      ],
      etiqueta: "Seguridad de la puerta",
      requerido: true,
      grupo: "vidrio",
      defecto: "yale",
      soloSiValor: SOLO_VIDRIO_BATIENTE,
    },
    { nombre: "segmentoCliente", tipo: "select", opciones: ["PA", "PM", "PB"], etiqueta: "Tipo de cliente", requerido: true, grupo: "cliente" },
    { nombre: "descripcionItem", tipo: "string", etiqueta: "Ubicación (opcional)", requerido: false, grupo: "comercial" },
    { nombre: "conInstalacion", tipo: "boolean", etiqueta: "Con instalación", requerido: false, grupo: "comercial", defecto: true },
    { nombre: "cantidadPiezas", tipo: "number", etiqueta: "Cantidad de divisiones iguales", requerido: true, grupo: "comercial" },
  ],
};

// ─── Cálculo ────────────────────────────────────────────────────────────────

export type TipoDivision = "solo-vidrio" | "enmarcada";
export type AperturaDivision = "batiente" | "corrediza";

/** La composición en metros, ya validada. La exportan las pruebas y la frase comercial. */
export interface Composicion {
  tipo: TipoDivision;
  apertura: AperturaDivision;
  anchoM: number;
  altoM: number;
  /** Puertas (batiente) u hojas corredizas (corrediza). */
  moviles: number;
  /** Ancho de cada puerta u hoja corrediza. */
  anchoMovilM: number;
  /** Fijos (batiente) u hojas fijas (corrediza). */
  fijos: number;
  /** Ancho de CADA fijo. */
  anchoFijoM: number;
  /** "OPO", "OXXO"… */
  configuracion: string;
  /** Algo que el asesor debe saber (p. ej. ancho de puerta ignorado). */
  aviso: string | null;
}

const entero = (v: unknown, defecto: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : defecto;
};

/** La configuración elegida, o la armada con los campos del formato anterior
 * (puertas/fijos, hojas corredizas/fijas) si un ítem llegara así. */
function configuracionDe(input: InputModulo, apertura: AperturaDivision): string {
  const lista = apertura === "corrediza" ? CONFIGURACIONES_CORREDIZA : CONFIGURACIONES_BATIENTE;
  const valor = String(apertura === "corrediza" ? input?.configuracionCorrediza ?? "" : input?.configuracionBatiente ?? "")
    .trim()
    .toUpperCase();
  if (lista.some((o) => o.value === valor)) return valor;
  if (valor) throw new Error(`La configuración "${valor}" no existe para una división ${apertura}.`);
  const movil = apertura === "corrediza" ? "X" : "P";
  const moviles = entero(apertura === "corrediza" ? input?.hojasCorredizas : input?.numeroPuertas, NaN);
  const fijos = entero(apertura === "corrediza" ? input?.hojasFijas : input?.numeroFijos, NaN);
  if (Number.isFinite(moviles) && Number.isFinite(fijos)) {
    const antes = Math.ceil(fijos / 2);
    return "O".repeat(antes) + movil.repeat(moviles) + "O".repeat(fijos - antes);
  }
  return apertura === "corrediza" ? "OX" : "OPO";
}

export function composicionDe(input: InputModulo): Composicion {
  const tipo: TipoDivision = input?.tipo === "enmarcada" ? "enmarcada" : "solo-vidrio";
  const apertura: AperturaDivision = input?.apertura === "corrediza" ? "corrediza" : "batiente";
  const anchoM = Number(input?.anchoCm) / 100;
  const altoM = Number(input?.altoCm) / 100;
  if (!Number.isFinite(anchoM) || anchoM <= 0) throw new Error("El ancho total es obligatorio y debe ser mayor a 0.");
  if (!Number.isFinite(altoM) || altoM <= 0) throw new Error("El alto total es obligatorio y debe ser mayor a 0.");

  const configuracion = configuracionDe(input, apertura);
  const moviles = (configuracion.match(apertura === "corrediza" ? /X/g : /P/g) ?? []).length;
  const fijos = (configuracion.match(/O/g) ?? []).length;
  const anchoIgual = anchoM / (moviles + fijos);
  const base = { tipo, apertura, anchoM, altoM, moviles, fijos, configuracion };

  // Corrediza: siempre hojas iguales.
  if (apertura === "corrediza") {
    return { ...base, anchoMovilM: anchoIgual, anchoFijoM: fijos ? anchoIgual : 0, aviso: null };
  }

  // Batiente: el ancho de puerta es opcional; vacío = hojas iguales.
  const crudo = input?.anchoPuertaCm;
  if (crudo === undefined || crudo === null || crudo === "") {
    return { ...base, anchoMovilM: anchoIgual, anchoFijoM: fijos ? anchoIgual : 0, aviso: null };
  }
  const anchoPuertaM = Number(crudo) / 100;
  if (!Number.isFinite(anchoPuertaM) || anchoPuertaM <= 0) {
    throw new Error("El ancho de puerta debe ser un número mayor a 0, o déjalo vacío para hojas iguales.");
  }
  if (fijos === 0) {
    const igual = Math.abs(anchoPuertaM - anchoIgual) < 0.005;
    return {
      ...base,
      anchoMovilM: anchoIgual,
      anchoFijoM: 0,
      aviso: igual
        ? null
        : `Sin fijos, ${moviles === 1 ? "la puerta ocupa" : "las puertas ocupan"} todo el ancho: se cotizó con ` +
          `${Math.round(anchoIgual * 1000)} mm por puerta y no con el ancho de puerta escrito.`,
    };
  }
  const sobrante = anchoM - moviles * anchoPuertaM;
  if (sobrante < 0.01) {
    throw new Error(
      `${moviles === 1 ? "La puerta ocupa" : "Las puertas ocupan"} ${Math.round(moviles * anchoPuertaM * 1000)} mm de ` +
        `${Math.round(anchoM * 1000)} mm: no queda espacio para los fijos. Reduce el ancho de la puerta o déjalo vacío.`
    );
  }
  return { ...base, anchoMovilM: anchoPuertaM, anchoFijoM: sobrante / fijos, aviso: null };
}

export function calcular(input: InputModulo) {
  const { segmentoCliente, cantidadPiezas = 1, descuentoPct = 0 } = input ?? {};
  if (!segmentosValidos().includes(segmentoCliente)) {
    throw new Error(`segmentoCliente inválido: "${segmentoCliente}". Debe ser uno de ${segmentosValidos().join(", ")}.`);
  }
  const piezas = Number(cantidadPiezas);
  if (!Number.isInteger(piezas) || piezas <= 0) throw new Error("La cantidad debe ser un entero mayor a 0.");
  const descuento = Number(descuentoPct) || 0;
  if (descuento < 0 || descuento >= 1) throw new Error("descuentoPct debe ser una fracción entre 0 y 1.");

  const comp = composicionDe(input);
  const { tipo, apertura, anchoM: A, altoM: H, moviles, anchoMovilM, fijos, anchoFijoM } = comp;
  const color = normalizarColor(input?.colorPerfileria) || "mate";
  const seg = String(segmentoCliente);
  const advertencias: string[] = comp.aviso ? [comp.aviso] : [];
  const items: LineaBOM[] = [];

  const avisados = new Set<string>();
  const porColor = (perfil: keyof typeof POR_COLOR): string => {
    const tabla = POR_COLOR[perfil];
    if (tabla[color]) return tabla[color];
    if (!avisados.has(perfil)) {
      avisados.add(perfil);
      advertencias.push(`${NOMBRE_PERFIL[perfil]} no existe en color ${color}: se cotizó en mate (${tabla.mate}).`);
    }
    return tabla.mate;
  };
  const und = (codigo: string, cantidad: number) => {
    if (cantidad > 0) items.push(lineaCatalogo(codigo, cantidad, seg, { unidadOverride: "UND" }));
  };
  const ml = (codigo: string, metros: number) => {
    if (metros > 0) items.push(lineaCatalogo(codigo, metros, seg, { unidadOverride: "ML" }));
  };

  const areaTotal = areaM2(A * 100, H * 100);
  const perimetroMovil = 2 * (anchoMovilM + H);
  const perimetroFijo = fijos ? 2 * (anchoFijoM + H) : 0;
  const anchoFijosTotal = fijos * anchoFijoM;

  if (tipo === "solo-vidrio" && apertura === "batiente") {
    items.push(lineaCatalogo(C.vidrio8, areaTotal, seg, { unidadOverride: "M2" }));
    if (input?.inferiorPuerta === "zocalo") {
      ml(C.zocalo, anchoMovilM * moviles);
    } else {
      und(C.esquineroSuperior, moviles);
      und(C.esquineroInferior, moviles);
    }
    und(C.topeCazuela, 2 * moviles);
    und(C.manijaRoma, moviles);
    if (input?.seguridadPuerta === "recibidor") {
      und(C.recibidorRedondeado, moviles);
    } else {
      und(C.cerraduraYale, moviles);
      und(C.escudoYale, moviles);
    }
    // Fijos: igual que en la corrediza (decisión del usuario).
    ml(porColor("U32"), anchoFijosTotal);
    ml(C.perfilF, H * fijos);
  } else if (tipo === "solo-vidrio") {
    items.push(lineaCatalogo(C.vidrio6, areaTotal, seg, { unidadOverride: "M2" }));
    ml(C.rielOptiglas, A);
    const pesoHoja = anchoMovilM * H * ESPESOR_CORREDIZA_MM * KG_POR_M2_MM;
    const kit = pesoHoja > CAPACIDAD_KIT_60 ? C.kitOptiglas80 : C.kitOptiglas60;
    if (pesoHoja > CAPACIDAD_KIT_80) {
      advertencias.push(
        `Cada hoja corrediza pesa unos ${Math.round(pesoHoja)} kg y el kit Optiglas más grande soporta ${CAPACIDAD_KIT_80} kg: revisa el herraje con el proveedor.`
      );
    }
    und(kit, moviles);
    und(C.manijaRoma, moviles);
    und(C.picoloroChapeta, moviles);
    ml(porColor("U32"), anchoFijosTotal);
    ml(C.perfilF, H * fijos);
    ml(porColor("T70"), 2 * H); // dos parales verticales
  } else if (apertura === "batiente") {
    items.push(lineaCatalogo(C.vidrio6, areaTotal, seg, { unidadOverride: "M2" }));
    const divisiones = moviles + fijos - 1;
    ml(porColor("T244"), 2 * A + 2 * H + H * divisiones);
    ml(porColor("ADAPTADOR_175"), perimetroFijo * fijos);
    ml(porColor("PISAVIDRIO_177"), perimetroFijo * fijos);
    ml(C.empaqueAntirretractil, perimetroFijo * fijos + perimetroMovil * moviles);
    ml(porColor("U57"), perimetroMovil * moviles);
    und(porColor("BISAGRA_OMEGA"), 4 * moviles);
    und(C.topeCazuela, moviles);
    und(C.yaleMini, moviles);
  } else {
    items.push(lineaCatalogo(C.vidrio6, areaTotal, seg, { unidadOverride: "M2" }));
    const perimetroPanos = perimetroMovil * (moviles + fijos);
    ml(C.rielDucasse, A);
    ml(porColor("T244"), 2 * A + 2 * H);
    ml(porColor("ADAPTADOR_175"), perimetroPanos);
    ml(porColor("PISAVIDRIO_177"), perimetroPanos);
    und(C.rodamientoDucasse, 2 * moviles);
    ml(C.empaqueAntirretractil, perimetroPanos);
    und(C.picoloroIncrustar, moviles);
    und(C.tiraderaMultiuso, moviles);
  }

  const p = getParametros();
  const resultado = totalizar(items, { cantidadPiezas: piezas, descuentoPct: descuento, aiu: p.aiu, ivaPct: p.iva });
  return { ...resultado, areaM2: areaTotal, advertencias };
}
