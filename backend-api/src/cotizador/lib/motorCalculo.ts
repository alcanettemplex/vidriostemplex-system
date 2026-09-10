// Utilidades comunes de cálculo, compartidas por TODOS los módulos de producto
// (Ventanas, Proyectantes, Cabinas Corredizas, Cabinas Batientes, Tablero, Espejo).
//
// Cadena de cálculo (igual regla de negocio que el Excel original, corrigiendo los
// bugs documentados en el análisis previo a la webapp):
//
//   subtotalPieza = suma(item.cantidad * item.precioUnitario)     [1 pieza/unidad]
//   subtotal      = subtotalPieza * cantidadPiezas                [multiplicar SOLO AQUÍ, una vez]
//   subtotalConAiu = subtotal / aiu           (aiu = 0.96 -> equivale a un margen adicional del ~4%)
//   descuento     = subtotalConAiu * descuentoPct
//   baseIva       = subtotalConAiu - descuento
//   iva           = baseIva * ivaPct
//   total         = baseIva + iva
//
// IMPORTANTE (bug #10 del Excel original): la cantidad de "piezas iguales" (p.ej.
// "cotizar 2 tableros idénticos") se aplica UNA sola vez sobre el subtotal de una
// pieza, nunca dentro de cada línea del BOM Y otra vez al final.

import { getPrecio, getProducto } from './catalogo';

export interface LineaBOM {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  valorTotal: number;
  error: boolean;
  provisional?: boolean;
  fuentePrecio?: string;
  revisarPrecio?: boolean;
  [clave: string]: unknown;
}

export interface Totales {
  items: LineaBOM[];
  cantidadPiezas: number;
  subtotalPieza: number;
  subtotal: number;
  aiu: number;
  subtotalConAiu: number;
  descuentoPct: number;
  descuento: number;
  ivaPct: number;
  baseIva: number;
  iva: number;
  total: number;
  hayErrores: boolean;
}

/**
 * Construye una línea de BOM (lista de materiales) a partir de un código de catálogo.
 * Si el código no existe, en vez de dejar pasar precio $0 en silencio (bug #4 del
 * Excel original), retorna una línea marcada con `error: true` para que el llamador
 * decida bloquear la cotización.
 *
 * El mismo bug #4 se colaba también por una segunda puerta: un código SÍ presente
 * en el catálogo pero sin precio cargado para el segmento pedido (precio_pa/pm/pb
 * en 0 o no numérico — hay 12 así en el catálogo, cuatro de ellos con la
 * descripción literal "CODIGO NO EXISTE"). Antes eso costaba $0 en silencio; ahora
 * getPrecio devuelve null en ese caso y se bloquea igual que el código ausente.
 */
export function lineaCatalogo(
  codigo: string,
  cantidad: number,
  segmentoCliente: string,
  { unidadOverride }: { unidadOverride?: string } = {}
): LineaBOM {
  const producto = getProducto(codigo);
  if (!producto) {
    return {
      codigo,
      descripcion: `Código "${codigo}" no existe en el catálogo`,
      categoria: 'ERROR',
      unidad: unidadOverride ?? '',
      cantidad,
      precioUnitario: 0,
      valorTotal: 0,
      error: true,
    };
  }
  const precioUnitario = getPrecio(codigo, segmentoCliente);
  if (precioUnitario === null) {
    return {
      codigo: producto.codigo,
      descripcion: `El producto ${codigo} existe en el catálogo pero no tiene precio cargado para el segmento ${segmentoCliente}.`,
      categoria: 'ERROR',
      unidad: unidadOverride ?? producto.unidad,
      cantidad,
      precioUnitario: 0,
      valorTotal: 0,
      error: true,
    };
  }
  const cantidadRedondeada = Math.round(cantidad * 10000) / 10000;
  return {
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    categoria: producto.categoria,
    unidad: unidadOverride ?? producto.unidad,
    cantidad: cantidadRedondeada,
    precioUnitario,
    valorTotal: Math.round(precioUnitario * cantidadRedondeada * 100) / 100,
    error: false,
    // El precio no es del catálogo de Templex sino derivado de una fuente
    // externa; se propaga para que la interfaz lo señale y nadie lo tome por
    // definitivo.
    ...(producto.provisional
      ? {
          provisional: true,
          fuentePrecio: producto.fuente,
          revisarPrecio: Boolean(producto.sospechosoValorPorDefecto),
        }
      : {}),
  };
}

/**
 * Une varias líneas ya construidas (por ejemplo con lineaCatalogo) o "líneas manuales"
 * (sin código de catálogo, valor ya conocido — p.ej. mano de obra calculada aparte)
 * y aplica AIU + descuento + IVA una sola vez sobre el conjunto, multiplicado por
 * la cantidad de piezas iguales pedidas.
 *
 * @param items - líneas de BOM de UNA pieza (ver lineaCatalogo)
 * @param opts.cantidadPiezas - cuántas piezas idénticas se cotizan (default 1)
 * @param opts.descuentoPct - fracción 0-1 (default 0)
 * @param opts.aiu - factor AIU (default 0.96, tomado de parámetros globales)
 * @param opts.ivaPct - fracción 0-1 (default 0.19)
 */
export function totalizar(
  items: LineaBOM[],
  {
    cantidadPiezas = 1,
    descuentoPct = 0,
    aiu = 0.96,
    ivaPct = 0.19,
  }: { cantidadPiezas?: number; descuentoPct?: number; aiu?: number; ivaPct?: number } = {}
): Totales {
  const hayErrores = items.some((it) => it.error);
  const subtotalPieza = round2(items.reduce((acc, it) => acc + it.valorTotal, 0));
  const subtotal = round2(subtotalPieza * cantidadPiezas);
  const subtotalConAiu = round2(aiu ? subtotal / aiu : subtotal);
  const descuento = round2(subtotalConAiu * descuentoPct);
  const baseIva = round2(subtotalConAiu - descuento);
  const iva = round2(baseIva * ivaPct);
  const total = round2(baseIva + iva);

  return {
    items,
    cantidadPiezas,
    subtotalPieza,
    subtotal,
    aiu,
    subtotalConAiu,
    descuentoPct,
    descuento,
    ivaPct,
    baseIva,
    iva,
    total,
    hayErrores,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Área en m² a partir de medidas en centímetros (convención de entrada para toda la app:
 * el usuario siempre ingresa ancho/alto en CENTÍMETROS, igual que en el Excel original). */
export function areaM2(anchoCm: number, altoCm: number): number {
  return round2((anchoCm / 100) * (altoCm / 100));
}

/** Perímetro en metros lineales a partir de medidas en centímetros. */
export function perimetroM(anchoCm: number, altoCm: number): number {
  return round2(2 * (anchoCm / 100 + altoCm / 100));
}
