// Adaptador de precios sobre Postgres. Reemplaza al `proveedorLocal.js` del
// proyecto de origen, que leía JSON de disco.
//
// Implementa EXACTAMENTE el mismo contrato de lectura —mismas firmas, mismas
// formas de retorno, y sobre todo SÍNCRONO—, que es lo que permite que
// `lib/catalogo.ts` cambie una sola línea de import y que los 6 módulos de
// producto, `motorCalculo`, `motorDespiece`, `cotizarPorDiseno` y
// `aptitudOrden` no se enteren de que los precios ahora viven en una base de
// datos. El propio `catalogo.js` original fue escrito anticipando este
// momento; aquí sólo hay que no romperlo.
//
// La sincronía sale de la caché en memoria (`cotizador/cache.ts`): la
// resolución de las 4 capas de precedencia ya está hecha allí, al precargar.
//
// La ESCRITURA (editar precio, alta, baja, historial, parámetros) no forma
// parte de este contrato y no vive aquí: se reimplementa asíncrona y en
// transacción en `cotizador_precios.controller.ts`, que al terminar invalida
// la caché.
import * as cache from '../../cache';
import type { ListadoProductos, Parametros, Producto } from '../../tipos';

/**
 * Producto completo ya resuelto (catálogo real + altas + provisional, con
 * cualquier override de precio/costo/estado aplicado encima).
 * `null` si el código no existe en ninguna capa.
 */
export function getProducto(codigo: string): Producto | null {
  return cache.getProductos().get(codigo) ?? null;
}

// Rango Unicode de marcas diacríticas combinantes (tildes, diéresis…), U+0300
// a U+036F. Construido con fromCharCode en vez de un escape literal en el
// código fuente para no depender de que el editor o la terminal preserven
// bytes combinantes sueltos sin normalizar.
const DIACRITICOS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
);

function normalizarTexto(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase();
}

/**
 * Lista paginada del catálogo resuelto, con búsqueda de texto (por código o
 * descripción, insensible a mayúsculas y tildes) y filtro por categoría.
 *
 * Incluye los productos dados de baja (`activo:false`): quien pinta la UI
 * decide si los atenúa o los oculta, esta función no censura datos.
 */
export function listar({
  categoria,
  q,
  pagina = 1,
  porPagina = 50,
}: {
  categoria?: string;
  q?: string;
  pagina?: number;
  porPagina?: number;
} = {}): ListadoProductos {
  let items = [...cache.getProductos().values()];
  if (categoria) items = items.filter((p) => p.categoria === categoria);
  if (q && String(q).trim()) {
    const qNorm = normalizarTexto(q);
    items = items.filter(
      (p) =>
        normalizarTexto(p.codigo).includes(qNorm) || normalizarTexto(p.descripcion).includes(qNorm)
    );
  }
  // Orden estable por código: sin esto la paginación "salta" productos entre
  // páginas, porque el Map no garantiza el mismo orden tras cada recarga.
  items.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  const total = items.length;
  const pag = Math.max(1, Number(pagina) || 1);
  const porPag = Math.max(1, Number(porPagina) || 50);
  const inicio = (pag - 1) * porPag;

  return { items: items.slice(inicio, inicio + porPag), total, pagina: pag, porPagina: porPag };
}

/**
 * Precio de venta de un código para un segmento de cliente (PA/PM/PB).
 *
 * Devuelve `null` si el código no existe, O si el precio de ese segmento no es
 * un número finito mayor que 0. Esa segunda condición (no basta con que la
 * clave exista) es la que arregla el bug #4: hay 12 productos reales con
 * `precio_pa ≤ 0`, y un código presente con precio $0 es tan inválido para
 * cotizar como un código ausente. El Excel original los dejaba pasar con
 * descripción "Codigo No existe" y precio cero.
 */
export function getPrecio(codigo: string, segmentoCliente: string): number | null {
  const p = getProducto(codigo);
  if (!p) return null;
  const key = `precio_${String(segmentoCliente).toLowerCase()}` as keyof Producto;
  const valor = Number(p[key]);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Parámetros globales de negocio (aiu, iva, clientes, flete_fijo, smo,
 * asesores, estados_cotizacion), con cualquier override editable ya aplicado.
 */
export function getParametros(): Parametros {
  return cache.getParametros();
}

/**
 * Invalida la caché de precios y parámetros.
 *
 * En el origen era síncrona porque releía archivos; aquí es asíncrona, y no
 * pasa nada: ningún motor la llama. Sus únicos llamadores eran las rutas de
 * precios, que hoy son controladores y pueden esperarla — deben hacerlo
 * DESPUÉS del commit.
 */
export async function recargar(): Promise<void> {
  await cache.recargar('precios');
}
