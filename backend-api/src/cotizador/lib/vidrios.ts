// Vidrio de Ventanas, Proyectantes y Pérgola: la lista completa del catálogo (2026-10-30).
//
// Hasta esta fecha cada módulo tenía su propia lista fija (Ventanas 8 vidrios,
// Proyectantes 3, Pérgola 6) y validaba contra ella: el asesor no podía cotizar
// un bronce, un gris o un laminado aunque estuvieran en el catálogo con precio.
// Pedido del usuario: mostrar el listado completo.
//
// Decisiones del usuario (2026-10-30):
// - Solo Ventanas, Proyectantes y Pérgola. Cabinas, Tablero y División siguen
//   pidiendo espesor: el templado es parte del producto y su BPB/perforaciones
//   se cobran por espesor.
// - Se muestra todo y el asesor decide si el vidrio cabe en el perfil: no hay
//   tope de espesor por sistema.
// - Un vidrio sin precio ("precio a cotizar" o en $0) NO se ofrece hasta que lo
//   tenga. El vidrio no tiene campo de costo manual como la película.
//
// Igual que la película (lib/peliculas.ts), la lista sale del catálogo vigente y
// no de una constante: un vidrio dado de alta aparece solo en el formulario.
import { listarCatalogo, getProducto } from "./catalogo";
import type { Producto } from "../tipos";

/** El de siempre cuando no se elige ninguno (o el elegido no se puede cotizar). */
export const VIDRIO_POR_DEFECTO = "CL4MM01CR";

function tienePrecio(p: Producto): boolean {
  return !p.precioACotizar && [p.precio_pa, p.precio_pm, p.precio_pb].every((v) => Number(v) > 0);
}

/** Vidrio por m² de la categoría VIDRIO: deja fuera los espejos (tienen su
 * módulo), la guía de piso mal categorizada (GPI1102) y el BPB por metro. */
function esVidrioCotizable(p: Producto): boolean {
  const descripcion = String(p.descripcion ?? "").trim().toUpperCase();
  return (
    p.activo !== false &&
    p.categoria === "VIDRIO" &&
    String(p.unidad ?? "").trim().toUpperCase() === "X M2" &&
    !descripcion.startsWith("ESPEJO") &&
    tienePrecio(p)
  );
}

/** "VIDRIO CLARO  6MM TEMPLADO SP" → "Claro 6 mm templado SP";
 *  "VIDRIO GRIS EN 6MM TEMPLADO SP" → "Gris 6 mm templado SP". */
function etiquetaVidrio(descripcion: string): string {
  const texto = descripcion
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^VIDRIO\s+/i, "")
    .replace(/\bEN\s+(?=\d)/i, "")
    .replace(/(\d)\s*MM\b/gi, "$1 mm")
    .toLowerCase()
    .replace(/\b(sp|stv|bpb)\b/g, (s) => s.toUpperCase());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Vidrios cotizables, ordenados por nombre (los espesores en orden numérico). */
export function listarVidrios(): Producto[] {
  return listarCatalogo({ categoria: "VIDRIO" })
    .filter(esVidrioCotizable)
    .sort((a, b) => etiquetaVidrio(a.descripcion).localeCompare(etiquetaVidrio(b.descripcion), "es", { numeric: true }));
}

/** Campo `codigoVidrio` del formulario con las opciones del catálogo vigente. */
export function opcionesVidrio(): { value: string; label: string }[] {
  return listarVidrios().map((p) => ({ value: p.codigo, label: etiquetaVidrio(p.descripcion) }));
}

/** ¿Se puede cotizar este código? La misma regla que arma el selector. */
export function esVidrioValido(codigo: unknown): boolean {
  if (typeof codigo !== "string" || codigo.trim() === "") return false;
  const p = getProducto(codigo.trim());
  return p !== null && esVidrioCotizable(p);
}

/**
 * Código a cotizar y su aviso, si hubo que cambiarlo. Vacío → el de por
 * defecto, sin aviso. Un código que no se puede cotizar también cae al de por
 * defecto, pero CON aviso: el precio ya no corresponde al vidrio pedido y el
 * asesor tiene que saberlo (bug #2 del 2026-09-20, ver cotizador.md).
 */
export function resolverVidrio(
  codigo: unknown,
  porDefecto: { codigo: string; nombre: string } = { codigo: VIDRIO_POR_DEFECTO, nombre: "Claro 4 mm crudo" }
): { codigo: string; advertencia: string | null } {
  const pedido = typeof codigo === "string" ? codigo.trim() : "";
  if (pedido === "") return { codigo: porDefecto.codigo, advertencia: null };
  if (esVidrioValido(pedido)) return { codigo: pedido, advertencia: null };
  return {
    codigo: porDefecto.codigo,
    advertencia:
      `El vidrio "${pedido}" no se puede cotizar (no está en el catálogo o no tiene precio), así que se ` +
      `usó ${porDefecto.nombre} (${porDefecto.codigo}). Elige uno de la lista del formulario: el precio de ` +
      `este ítem NO corresponde al vidrio que pediste.`,
  };
}

/** Nombre del vidrio para la descripción comercial: "claro 5 mm templado".
 * Sin la línea de fabricación (SP), que es interna y el cliente no la lee.
 * null sin catálogo cargado (pruebas puras): el llamador usa la etiqueta fija. */
export function nombreComercialVidrio(codigo: unknown): string | null {
  if (typeof codigo !== "string" || codigo.trim() === "") return null;
  let descripcion: string | null = null;
  try {
    descripcion = getProducto(codigo.trim())?.descripcion ?? null;
  } catch {
    descripcion = null;
  }
  if (!descripcion) return null;
  const etiqueta = etiquetaVidrio(descripcion).replace(/\s+SP$/, "");
  return etiqueta.charAt(0).toLowerCase() + etiqueta.slice(1);
}

/** Campo `codigoVidrio` común a Ventanas, Proyectantes y Pérgola. Las opciones
 * reales las pone `listarModulos()` en cada consulta (`opcionesDinamicas`); las
 * de aquí son las de antes del 2026-10-30, y solo las lee quien mira el meta sin
 * pasar por ahí (la descripción comercial sin catálogo, en pruebas puras). */
export const CAMPO_VIDRIO = {
  nombre: "codigoVidrio",
  tipo: "select",
  opciones: [
    { value: "CL4MM01CR", label: "Claro 4mm crudo" },
    { value: "CL5MM01CR", label: "Claro 5mm crudo" },
    { value: "CL6MM01CR", label: "Claro 6mm crudo" },
    { value: "CL4MM03SP", label: "Claro 4mm templado" },
    { value: "CL5MM03SP", label: "Claro 5mm templado" },
    { value: "CL6MM03SP", label: "Claro 6mm templado" },
    { value: "CL8MM03SP", label: "Claro 8mm templado" },
    { value: "CL10MM03SP", label: "Claro 10mm templado" },
  ],
  opcionesDinamicas: "vidrios",
  etiqueta: "Tipo de vidrio",
  requerido: false,
  grupo: "vidrio",
};
