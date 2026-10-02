// Alfajía de las ventanas: cuál se cobra, cuál se recomienda y de qué color
// (2026-10-01, decisiones del usuario).
//
// Hasta esta fecha "Incluir alfajía" era un sí/no que solo cobraba algo en el
// 5020 mate (SIA0102, el sillar alfajía 581, por metro y ADEMÁS del sillar) y en
// cualquier otro sistema o color dejaba un aviso y no cobraba nada — pero la
// descripción comercial igual decía "con alfajía". Además el motor descartaba
// la pieza de alfajía que trae cada diseño, así que nunca llegaba a los cortes
// ni a la SAP.
//
// Reglas de ahora:
//   · Al marcar la casilla el asesor elige la alfajía en un selector (campo
//     `alfajiaCodigo`). La lista sale del catálogo del Cotizador (cualquier
//     producto cuya descripción sea "ALFAJIA …" o "… SILLAR ALFAJIA …"), así que
//     una alfajía nueva dada de alta aparece sola.
//   · El COLOR de la alfajía es el de la perfilería de la ventana y no se elige
//     aparte: el selector solo muestra las de ese color y el motor rechaza
//     (línea de error) una de otro color.
//   · La RECOMENDADA es la referencia que trae el diseño de cada sistema:
//     5020 → S-332, 744 → 1123, 8025 → 1123, 7038 → 413. Sin elección explícita
//     se cobra la recomendada.
//   · Una ALFAJÍA suelta va debajo del sillar: entra al despiece con la fórmula
//     de corte de la pieza de alfajía del diseño (y su código pasa a ser el
//     elegido). Un SILLAR ALFAJÍA (581 del 5020) REEMPLAZA al sillar: toma la
//     fórmula del sillar y la alfajía suelta del diseño no entra. Así no se
//     cobran dos piezas por el mismo lugar.
//   · Sin alfajía disponible en el color de la ventana: línea de error, que
//     impide agregar el ítem — nunca un aviso que se pueda pasar por alto.
import { getProducto, listarCatalogo } from "./catalogo";
import type { Producto } from "../tipos";

export type TipoAlfajia = "alfajia" | "sillar";

export interface DatosAlfajia {
  tipo: TipoAlfajia;
  /** Referencia del perfil, normalizada sin "S-": "332", "1123", "413", "581". */
  ref: string;
  /** Tal como se escribe en el catálogo: "S-332", "1123". */
  refVisible: string;
  /** Color en la clave del formulario: "mate", "gris plata", "blanco"… */
  color: string;
  /** Sistema al que pertenece (solo los sillar alfajía lo dicen: "5020", "3831"). */
  sistema: string | null;
}

/** Recomendada por sistema: la referencia de alfajía que traen sus diseños. */
export const REF_RECOMENDADA_POR_SISTEMA: Readonly<Record<string, string>> = {
  "5020": "332",
  "744": "1123",
  "8025": "1123",
  "7038": "413",
};

const COLORES: Array<[RegExp, string]> = [
  [/\bGRIS\s+PLATA\b/, "gris plata"],
  [/\bMATE\b/, "mate"],
  [/\bCRUDO\b/, "crudo"],
  [/\bBLANC[AO]\b/, "blanco"],
  [/\bBRONCE\b/, "bronce"],
  [/\bNEGR[AO]\b/, "negro"],
];

/** Mismo criterio que el selector de color de ventanas. */
export function normalizarColor(color: unknown): string {
  const c = String(color ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (c === "grisplata" || c === "gris-plata") return "gris plata";
  return c;
}

/** Sistema del formulario de ventanas ("5020", "744"…) a partir del valor del
 * campo o del nombre del diseño ("Sistema5020Reforzado" → "5020"). */
export function sistemaCorto(valor: unknown): string {
  const m = /(5020|744|8025|7038|3831)/.exec(String(valor ?? ""));
  return m ? m[1] : "";
}

/**
 * Lee tipo, referencia y color de la descripción de un producto. null = no es
 * una alfajía, o no dice su color (sin color no se puede amarrar al de la
 * ventana, así que no se ofrece).
 *
 *   "ALFAJIA S-332 MATE"            → alfajia · 332 · mate
 *   "ALFAJIA 612 MATE 10CM"         → alfajia · 612 · mate
 *   "5020 SILLAR ALFAJIA 581 BRONCE"→ sillar · 581 · bronce · 5020
 */
export function analizarAlfajia(descripcion: unknown): DatosAlfajia | null {
  const d = String(descripcion ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const m = /^(?:(\d{3,4}) )?(SILLAR )?ALFAJIA (S-?\d+|\d+)\b(.*)$/.exec(d);
  if (!m) return null;
  const resto = m[4] ?? "";
  const color = COLORES.find(([re]) => re.test(resto))?.[1];
  if (!color) return null;
  const refVisible = m[3].replace(/^S(\d)/, "S-$1");
  return {
    tipo: m[2] ? "sillar" : "alfajia",
    ref: refVisible.replace(/^S-?/, ""),
    refVisible,
    color,
    sistema: m[1] ?? null,
  };
}

export interface AlfajiaCatalogo extends DatosAlfajia {
  codigo: string;
  descripcion: string;
}

/** Alfajías cotizables del catálogo (activas y con color legible). */
export function listarAlfajias(): AlfajiaCatalogo[] {
  return listarCatalogo()
    .filter((p: Producto) => p.activo !== false)
    .map((p: Producto) => {
      const datos = analizarAlfajia(p.descripcion);
      return datos ? { ...datos, codigo: p.codigo, descripcion: p.descripcion } : null;
    })
    .filter((x): x is AlfajiaCatalogo => x !== null)
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

/** ¿Esta alfajía se puede poner en una ventana de este sistema? Un sillar
 * alfajía es de su sistema (el 581 es del 5020); una alfajía suelta, de todos. */
export function aplicaAlSistema(a: DatosAlfajia, sistema: string): boolean {
  return a.tipo === "alfajia" || a.sistema === sistema;
}

/** Código de la recomendada para un sistema y un color, o null si no existe en ese color. */
export function codigoRecomendado(sistema: string, color: string): string | null {
  const ref = REF_RECOMENDADA_POR_SISTEMA[sistema];
  if (!ref) return null;
  const c = normalizarColor(color);
  return listarAlfajias().find((a) => a.tipo === "alfajia" && a.ref === ref && a.color === c)?.codigo ?? null;
}

/** Lo que el motor necesita para cobrarla y ponerla en el despiece. */
export interface AlfajiaElegida {
  codigo: string;
  /** Sillar alfajía: reemplaza al sillar del diseño en vez de ir debajo. */
  reemplazaSillar: boolean;
  refVisible: string;
}

export type ResolucionAlfajia =
  | { tipo: "ninguna" }
  | { tipo: "ok"; alfajia: AlfajiaElegida }
  | { tipo: "error"; mensaje: string };

/**
 * Qué alfajía lleva el ítem, a partir de su input. Sin casilla → ninguna. Con
 * casilla, la elegida (`alfajiaCodigo`) o, si no hay, la recomendada. Valida que
 * exista, que sea del color de la ventana y que aplique al sistema.
 */
export function resolverAlfajia(input: Record<string, unknown>): ResolucionAlfajia {
  if (!(input.alfajia === true || input.alfajia === "true")) return { tipo: "ninguna" };
  const sistema = sistemaCorto(input.sistema);
  const color = normalizarColor(input.colorPerfileria) || "mate";
  const pedido = typeof input.alfajiaCodigo === "string" ? input.alfajiaCodigo.trim().toUpperCase() : "";
  const codigo = pedido || codigoRecomendado(sistema, color);
  if (!codigo) {
    return {
      tipo: "error",
      mensaje: `No hay alfajía en color ${color} para el sistema ${sistema || "elegido"}: quita la alfajía o pide a Compras que cree la referencia.`,
    };
  }
  const producto = getProducto(codigo);
  const datos = producto ? analizarAlfajia(producto.descripcion) : null;
  if (!producto || producto.activo === false || !datos) {
    return { tipo: "error", mensaje: `La alfajía ${codigo} no existe en el catálogo del Cotizador: elige otra.` };
  }
  if (datos.color !== color) {
    return {
      tipo: "error",
      mensaje: `La alfajía ${codigo} es color ${datos.color} y la ventana es ${color}: la alfajía va del color de la perfilería.`,
    };
  }
  if (!aplicaAlSistema(datos, sistema)) {
    return {
      tipo: "error",
      mensaje: `El sillar alfajía ${codigo} es del sistema ${datos.sistema} y la ventana es ${sistema}: elige una alfajía suelta.`,
    };
  }
  return { tipo: "ok", alfajia: { codigo, reemplazaSillar: datos.tipo === "sillar", refVisible: datos.refVisible } };
}

/** Para el despiece y la verificación de corte: la alfajía, o null. */
export function alfajiaDeInput(input: Record<string, unknown>): AlfajiaElegida | null {
  const r = resolverAlfajia(input);
  return r.tipo === "ok" ? r.alfajia : null;
}

/** "alfajía 1123" / "sillar alfajía 581" para la descripción comercial; null
 * si no lleva o no se pudo resolver (entonces tampoco se cobró). Tolera correr
 * sin caché (pruebas puras): ahí dice "alfajía" a secas. */
export function nombreAlfajia(input: Record<string, unknown>): string | null {
  if (!(input.alfajia === true || input.alfajia === "true")) return null;
  try {
    const r = resolverAlfajia(input);
    if (r.tipo !== "ok") return null;
    return `${r.alfajia.reemplazaSillar ? "sillar alfajía" : "alfajía"} ${r.alfajia.refVisible}`;
  } catch {
    return "alfajía";
  }
}

/** Opciones del selector (`opcionesDinamicas: "alfajias"`). Cada una lleva su
 * color, referencia, tipo y sistema: el formulario filtra por el color de la
 * perfilería y pone primero la recomendada del sistema. */
export function opcionesAlfajia() {
  return listarAlfajias().map((a) => ({
    value: a.codigo,
    label: `${a.tipo === "sillar" ? "Sillar alfajía" : "Alfajía"} ${a.refVisible} ${a.color}`,
    color: a.color,
    ref: a.ref,
    tipoAlfajia: a.tipo,
    sistemaAlfajia: a.sistema,
  }));
}

/** Campos del formulario de ventanas. */
export const CAMPO_ALFAJIA = {
  nombre: "alfajia",
  tipo: "boolean",
  etiqueta: "Incluir alfajía",
  requerido: false,
  grupo: "cliente",
};

export const CAMPO_ALFAJIA_CODIGO = {
  nombre: "alfajiaCodigo",
  tipo: "select",
  opciones: [{ value: "", label: "La recomendada" }],
  opcionesDinamicas: "alfajias",
  etiqueta: "Alfajía",
  requerido: false,
  grupo: "cliente",
  soloSi: "alfajia",
  // El formulario lo filtra por color y ordena con la recomendada primero.
  filtroAlfajia: true,
  recomendadaPorSistema: REF_RECOMENDADA_POR_SISTEMA,
};
