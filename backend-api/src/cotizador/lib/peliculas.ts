// Película del vidrio: qué referencia se cobra (2026-09-27).
//
// Hasta esta fecha "Incluir película" era un sí/no que siempre cobraba PELI31
// ("PELICULA NORMAL"), porque el Cotizador sólo conocía esa referencia. El
// catálogo del ERP tiene 27 películas; se dieron de alta en el Cotizador
// (script 2026-09-27_cotizador_peliculas_catalogo.ts), todas en ACABADO, y el
// campo pasó a ser una lista.
//
// La lista se arma del catálogo del Cotizador y NO de una constante: una
// película nueva dada de alta desde "Catálogo general" aparece sola en el
// formulario. Una película sin precio de proveedor entra como "precio a
// cotizar": el asesor escribe su costo (`costoPelicula`) y `lineaCatalogo`
// le aplica el multiplicador y deja la advertencia.
import { listarCatalogo, getProducto } from "./catalogo";
import type { Producto } from "../tipos";

/** La referencia que cobraba el sí/no. Un `pelicula: true` guardado antes del
 * 2026-09-27 sigue significando ésta. */
export const PELICULA_POR_DEFECTO = "PELI31";

function esPelicula(p: Producto): boolean {
  return p.activo !== false && String(p.descripcion ?? "").trim().toUpperCase().startsWith("PELICULA");
}

/** Películas cotizables, ordenadas por descripción, con la por defecto primero. */
export function listarPeliculas(): Producto[] {
  return listarCatalogo()
    .filter(esPelicula)
    .sort((a, b) => {
      if (a.codigo === PELICULA_POR_DEFECTO) return -1;
      if (b.codigo === PELICULA_POR_DEFECTO) return 1;
      return a.descripcion.localeCompare(b.descripcion, "es");
    });
}

/**
 * Código de catálogo de la película pedida, o null si no lleva.
 *
 * - `true` / "true" (sí/no de antes del 2026-09-27) → PELI31.
 * - Un código → ese código, tal cual: si no existe, `lineaCatalogo` lo marca
 *   como línea de error visible, que es la regla del módulo (nunca $0 en
 *   silencio ni sustituir por otra referencia).
 * - Vacío / false → sin película.
 */
export function codigoPelicula(valor: unknown): string | null {
  if (valor === true || valor === "true") return PELICULA_POR_DEFECTO;
  if (typeof valor !== "string") return null;
  const codigo = valor.trim().toUpperCase();
  return codigo === "" || codigo === "FALSE" ? null : codigo;
}

/** Nombre legible de la película pedida, para la descripción comercial. */
export function nombrePelicula(valor: unknown): string | null {
  const codigo = codigoPelicula(valor);
  if (!codigo) return null;
  // La descripción comercial también se arma fuera del backend en marcha
  // (pruebas puras, sin caché): sin catálogo, "película" a secas.
  let descripcion: string | null = null;
  try {
    descripcion = getProducto(codigo)?.descripcion ?? null;
  } catch {
    descripcion = null;
  }
  if (!descripcion) return codigo === PELICULA_POR_DEFECTO ? "película" : `película ${codigo}`;
  // "PELICULA CONTROL SOLAR TITANIO" → "película control solar titanio"
  return descripcion.trim().toLowerCase().replace(/^pelicula\b/, "película");
}

/** Campo `pelicula` del formulario con sus opciones del catálogo vigente.
 * Cada opción avisa si se cotiza aparte, para que el formulario pida el costo. */
export function opcionesPelicula(): { value: string; label: string; precioACotizar?: boolean }[] {
  return [
    { value: "", label: "Sin película" },
    ...listarPeliculas().map((p) => ({
      value: p.codigo,
      label: `${p.descripcion}${p.precioACotizar ? " (precio a cotizar)" : ""}`,
      ...(p.precioACotizar ? { precioACotizar: true } : {}),
    })),
  ];
}

/** Campo `pelicula` del formulario, común a ventanas, proyectantes y tablero.
 * Las opciones reales las pone `listarModulos()` en cada consulta
 * (`opcionesDinamicas`), para que reflejen el catálogo vigente; aquí sólo va
 * "Sin película" por si alguien lee el meta sin pasar por ahí. */
export const CAMPO_PELICULA = {
  nombre: "pelicula",
  tipo: "select",
  opciones: [{ value: "", label: "Sin película" }],
  opcionesDinamicas: "peliculas",
  etiqueta: "Película",
  requerido: false,
  grupo: "vidrio",
};

/** Campo del costo que escribe el asesor cuando la película no tiene precio. */
export const CAMPO_COSTO_PELICULA = {
  nombre: "costoPelicula",
  tipo: "number",
  etiqueta: "Costo de la película ($ por metro, del proveedor)",
  requerido: false,
  grupo: "vidrio",
  soloSiACotizar: "pelicula",
};
