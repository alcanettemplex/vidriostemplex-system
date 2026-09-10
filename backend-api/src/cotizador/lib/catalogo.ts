// Acceso al catálogo maestro de precios y a los parámetros globales de negocio.
// Fuente de verdad única (igual que en el Excel original: hoja COSTOS +
// Parametros), para que ningún módulo tenga su propia copia de precios.
//
// Punto único de import para el resto del código: por dentro delega TODO en
// el adaptador de precios, pero nadie más debería importar ese archivo
// directamente — sólo el controlador de precios tiene permiso, porque necesita
// las funciones de escritura que no forman parte de este contrato de sólo
// lectura.
//
// El archivo original decía: "el día que el usuario conecte su base de
// Supabase, se escribe un proveedorSupabase.js con la misma interfaz de
// lectura y aquí se cambia UNA línea de import: ningún módulo de cotización
// (motorCalculo, motorDespiece, los 6 módulos de producto) se entera del
// cambio". Ese día es hoy, y esa línea es la de abajo.
import * as proveedor from './precios/proveedorSequelize';
import type { ListadoProductos, Parametros, Producto } from '../tipos';

/** Devuelve el producto completo del catálogo, o null si el código no existe.
 * A diferencia del Excel original (que dejaba pasar precio $0 con la descripción
 * "Codigo No existe"), aquí se debe verificar explícitamente el resultado y
 * bloquear la cotización si es null (ver bug #4 documentado). */
export function getProducto(codigo: string): Producto | null {
  return proveedor.getProducto(codigo);
}

/** Precio de venta de un código para un segmento de cliente (PA/PM/PB).
 * null si el código no existe, O si el precio de ese segmento no es un
 * número finito mayor que 0 — un código presente con precio $0 o vacío es
 * tan inválido como un código ausente (ver el arreglo en motorCalculo,
 * función lineaCatalogo). */
export function getPrecio(codigo: string, segmentoCliente: string): number | null {
  return proveedor.getPrecio(codigo, segmentoCliente);
}

/** Arreglo completo (sin paginar) de productos del catálogo resuelto (catálogo
 * real + altas, con cualquier override aplicado). Contrato heredado: lo
 * consumen los 6 módulos de producto y humo.test esperando el arreglo
 * entero, no {items,total}, así que se pide una única "página" del tamaño de
 * todo el catálogo en vez de duplicar la lógica de filtrado que ya vive en
 * proveedor.listar().
 *
 * Excluye los precios PROVISIONALES a propósito, igual que hacía el
 * catalogo.js original: esa es una capa aparte y secundaria (ver
 * listarProvisionales), no parte del "catálogo" que consumen los módulos de
 * producto para poblar selects y validaciones — humo.test fija este
 * número en 430 precisamente para detectar si algún día se mezclan sin querer. */
export function listarCatalogo({ categoria }: { categoria?: string } = {}): Producto[] {
  return proveedor
    .listar({ categoria, pagina: 1, porPagina: Number.MAX_SAFE_INTEGER })
    .items.filter((p) => !p.provisional);
}

/** Productos con precio provisional (derivado de una fuente externa), para
 * revisarlos y reemplazarlos por los precios reales del proveedor. */
export function listarProvisionales(): Producto[] {
  return proveedor.listar({ pagina: 1, porPagina: Number.MAX_SAFE_INTEGER }).items.filter(
    (p) => p.provisional
  );
}

/** Parámetros globales de negocio (aiu, iva, clientes, flete_fijo, smo,
 * asesores, estados_cotizacion), con cualquier override editable ya aplicado. */
export function getParametros(): Parametros {
  return proveedor.getParametros();
}

export function segmentosValidos(): string[] {
  return getParametros().clientes;
}

/** Invalida la caché de precios, overrides y parámetros. Debe llamarse desde
 * el controlador de precios tras cada escritura (editar precio, dar de alta,
 * dar de baja, editar parámetros) para que el resto de la app vea el cambio
 * sin reiniciar el proceso.
 *
 * A diferencia del original es asíncrona: ningún motor la llamaba, sólo las
 * rutas de escritura. Ver la nota en proveedorSequelize.recargar(). */
export async function recargarPrecios(): Promise<void> {
  await proveedor.recargar();
}

/** Reexportado para quien necesite la forma paginada (el controlador de
 * precios); los motores usan `listarCatalogo`. */
export function listar(opts?: {
  categoria?: string;
  q?: string;
  pagina?: number;
  porPagina?: number;
}): ListadoProductos {
  return proveedor.listar(opts);
}
