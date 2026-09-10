// Orden en que se presentan las piezas de aluminio en una hoja de taller.
//
// ESTO ES UNA SUPOSICIÓN, NO UN HECHO DEL TALLER — léase antes de usar.
// No existe hoy ningún dato que diga en qué orden corta el maestro de verdad.
// La heurística de abajo (horizontales primero, luego verticales, cada grupo
// de mayor a menor longitud) es la convención más común en carpintería de
// aluminio porque así se aprovechan mejor las barras largas, pero es EXACTAMENTE
// eso: una convención razonable, no el orden real de Vidrios Templex. No lo
// llames "el orden del taller" en ninguna pantalla ni documento hasta que el
// maestro lo confirme — y cuando lo haga, este archivo es el único sitio que
// hay que tocar para que todos los documentos de taller cambien a la vez.
//
// Clasificación por palabras clave en la DESCRIPCIÓN del perfil, porque
// `cortes.perfiles[]` (motorDespiece.ts) no trae un campo de "tipo de pieza"
// explícito — sólo `ref` y `descripcion`. Se construyó recorriendo las 38
// descripciones distintas que existen hoy en disenos.json; una descripción
// nueva que no calce con ninguna lista cae en "otras" (al final, orden
// estable) en vez de adivinar dónde va.
const PALABRAS_HORIZONTAL = ['cabezal', 'sillar', 'horizontal', 'alfajia'];
const PALABRAS_VERTICAL = ['jamba', 'enganche', 'traslape'];

/** Marcas diacríticas combinantes (U+0300–U+036F): se quitan para que
 * "alfajía" y "alfajia" caigan en el mismo grupo. */
function normalizar(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function grupoDe(descripcion: unknown): number {
  const d = normalizar(descripcion);
  if (PALABRAS_HORIZONTAL.some((p) => d.includes(p))) return 0; // horizontales primero
  if (PALABRAS_VERTICAL.some((p) => d.includes(p))) return 1; // luego verticales
  return 2; // el resto (divisores, marcos, tubulares, herrajes de perfil...), al final
}

export interface CorteOrdenable {
  descripcion?: string | null;
  medidaMm?: number | null;
  [clave: string]: unknown;
}

/**
 * Ordena una lista de cortes de perfil (la misma forma que
 * `resultado.cortes.perfiles`: `{ref, descripcion, medidaMm, ...}`) para
 * presentarlos en una hoja de taller. No muta el array de entrada.
 *
 * Dentro de cada grupo, de mayor a menor longitud: es la pieza más larga la
 * que decide qué barra se abre, así que conviene verla primero.
 *
 * Devuelve una copia reordenada, cada elemento con `grupoOrden` añadido (0/1/2)
 * por si el documento quiere separar visualmente los tres bloques.
 */
export function ordenarParaTaller<T extends CorteOrdenable>(
  perfiles: T[] | null | undefined
): Array<T & { grupoOrden: number }> {
  const lista = Array.isArray(perfiles) ? perfiles : [];
  return lista
    .map((p, indiceOriginal) => ({ ...p, grupoOrden: grupoDe(p.descripcion), indiceOriginal }))
    .sort((a, b) => {
      if (a.grupoOrden !== b.grupoOrden) return a.grupoOrden - b.grupoOrden;
      const diff = (b.medidaMm ?? 0) - (a.medidaMm ?? 0);
      if (diff !== 0) return diff;
      return a.indiceOriginal - b.indiceOriginal; // empate: orden estable
    })
    .map(({ indiceOriginal, ...resto }) => resto as unknown as T & { grupoOrden: number });
}

/** Etiqueta en español para el `grupoOrden` que añade `ordenarParaTaller`,
 * útil para separar visualmente los tres bloques en un documento o pantalla. */
export const ETIQUETA_GRUPO_ORDEN = ['Horizontales', 'Verticales', 'Otras piezas'];
