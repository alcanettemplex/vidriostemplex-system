// Cargos de obra de una propuesta: mano de obra (SMO), alquiler de andamio,
// huacal, flete y servicios sueltos — más la cadena de totales que los combina
// con los productos.
//
// POR QUÉ EXISTE ESTE ARCHIVO (2026-09-20)
// Hasta hoy la mano de obra y el flete se inyectaban como dos líneas más del BOM
// de cada ítem, y `totalizar()` multiplica TODA línea del BOM por
// `cantidadPiezas`. Medido en vivo: una ventana OX 5020 de 1000×1500 con 5
// piezas cobraba 5 fletes ($200.000) y 5 manos de obra ($450.000); una
// cotización de 3 productos, 3 fletes más. Un flete se paga una vez, no una por
// pieza — así que el cargo dejó de ser una línea del ítem y pasó a ser una fila
// hermana, colgada de la propuesta.
//
// Este es el ÚNICO sitio donde se calcula una sugerencia de SMO y donde se
// resuelve la cadena de totales de una propuesta. Ni los módulos de producto ni
// el store ni los controladores repiten esa aritmética: si algún día el negocio
// cambia el orden de AIU/descuento/IVA, se cambia aquí y en ningún otro lado.
//
// DOS REGLAS QUE NO SE NEGOCIAN, y que explican toda la función de totales:
//   1. Los cargos van FUERA del AIU y FUERA del descuento. El descuento es una
//      concesión sobre el producto fabricado, no sobre el andamio que se
//      alquila ni sobre el flete que se paga a un tercero.
//   2. Los cargos SÍ llevan IVA, salvo que la línea diga `aplica_iva = false`
//      (el caso real es el proveedor de andamios que factura sin IVA).
//
// LA EXCEPCIÓN: MANO DE OBRA POR PRODUCTO (2026-09-26, decisión del usuario)
// Ensamble e instalación dejaron de ser un cargo "SMO" por tipo de obra y pasaron
// a calcularse POR PRODUCTO (ver `calcularManoObraProductos`). Se ven en el
// panel de cargos, pero se cobran como un producto más: llevan AIU, descuento de
// la propuesta e IVA. Por eso son tipos propios (ENSAMBLE / INSTALACION), los
// genera el sistema y la cadena de totales los separa del resto.
import { getParametros } from './catalogo';
import { round2 } from './motorCalculo';

export type TipoCargo = 'SMO' | 'ANDAMIO' | 'HUACAL' | 'FLETE' | 'OTRO' | 'ENSAMBLE' | 'INSTALACION';

/** Cargos de mano de obra por producto: automáticos y con AIU + descuento. */
export const TIPOS_MANO_OBRA: ReadonlySet<string> = new Set(['ENSAMBLE', 'INSTALACION']);

export function esCargoManoObra(tipo: unknown): boolean {
  return typeof tipo === 'string' && TIPOS_MANO_OBRA.has(tipo);
}

/** Un ítem de la propuesta, visto desde aquí: sólo interesan el módulo que lo
 * calculó, el input con el que se cotizó y el resultado del motor.
 *
 * Se tipa laxo por la misma razón documentada en `aptitudOrden.ts`: `resultado`
 * es un artefacto inmutable que pudo escribir una versión anterior del motor.
 * Todo lo que se lee de él se valida (`Number(...)`, `?? 0`) antes de usarse. */
export interface ItemParaCargos {
  moduloId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultado?: Record<string, any> | null;
}

/** Un cargo tal como llega del store (snake_case, igual que la fila) o del
 * controlador (camelCase). Se aceptan las dos formas para que nadie tenga que
 * traducir antes de pedir un total. */
export interface CargoParaTotales {
  tipo?: string;
  cantidad?: number | null;
  valor_unitario?: number | null;
  valorUnitario?: number | null;
  total?: number | null;
  aplica_iva?: boolean | null;
  aplicaIva?: boolean | null;
}

export interface TotalesPropuesta {
  /** Σ `subtotalConAiu` de los ítems. SIN descuento: es el precio de lista. */
  totalProductos: number;
  /** Σ líneas ENSAMBLE / INSTALACION, ya con AIU (2026-09-26). Entra junto a
   * los productos en la base del descuento y del IVA. */
  totalManoObra: number;
  totalDescuento: number;
  /** `totalProductos + totalManoObra − totalDescuento`: la base del IVA. */
  baseGravable: number;
  ivaProductos: number;
  /** Base de los cargos, sin IVA. */
  totalCargos: number;
  ivaCargos: number;
  /** IVA de productos + IVA de cargos. */
  totalIva: number;
  totalTotal: number;
}

/** Formatea un monto en pesos para la explicación. `Intl` con `es-CO` produce
 * "$ 60.000"; se quita el espacio para que se lea igual que en el resto del
 * módulo, donde el frontend usa `fmtCOP`. */
function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}

function m2Texto(n: number): string {
  return `${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

// ---------------------------------------------------------------------------
// Mano de obra por producto (2026-09-26)
// ---------------------------------------------------------------------------

/** Metros cuadrados mínimos que se cobran por PIEZA (decisión del usuario): una
 * ventana de 400×400 mm se cobra como 1 m². */
export const M2_MINIMO_POR_PIEZA = 1;

const MODULOS_VENTANERIA = new Set(['ventanas', 'proyectantes']);
const MODULOS_CABINA = new Set(['cabinas-corredizas', 'cabinas-batientes']);
const MODULOS_ESPEJO_TABLERO = new Set(['espejo', 'tablero']);

const positivo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function piezasDe(it: ItemParaCargos): number {
  const n = Number(it?.input?.cantidadPiezas ?? it?.resultado?.cantidadPiezas);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * Área de UNA pieza en m², leída de las MEDIDAS del formulario (centímetros).
 *
 * No se usa `resultado.areaM2`: no significa lo mismo en todos los módulos
 * (ventanas y proyectantes lo devuelven multiplicado por las piezas, tablero y
 * espejo el de una sola). Un proyectante sin diseño se mide por naves: número de
 * naves × ancho × alto de nave; con diseño trae el ancho y alto totales.
 */
export function areaPiezaM2(it: ItemParaCargos): number {
  const i = it?.input ?? {};
  if (it?.moduloId === 'proyectantes' && !(positivo(i.anchoCm) && positivo(i.altoCm))) {
    const naves = Math.max(1, Math.floor(positivo(i.numeroNaves) || 1));
    return (naves * positivo(i.anchoNaveCm) * positivo(i.altoNaveCm)) / 10000;
  }
  return (positivo(i.anchoCm) * positivo(i.altoCm)) / 10000;
}

/** m² que se cobran de un ítem: max(área de una pieza, mínimo) × piezas. */
export function m2CobrablesDe(it: ItemParaCargos): number {
  return Math.max(areaPiezaM2(it), M2_MINIMO_POR_PIEZA) * piezasDe(it);
}

/** El formulario guarda las casillas como booleano; se acepta también 'true'
 * por si un ítem viene de un JSON reescrito a mano. */
const marcado = (v: unknown): boolean => v === true || v === 'true';

export function conInstalacion(it: ItemParaCargos): boolean {
  return marcado(it?.input?.conInstalacion);
}

/**
 * Líneas AUTOMÁTICAS de mano de obra de una propuesta, a partir de sus ítems
 * (decisión del usuario, 2026-09-26). Tarifas en `cotizador.parametro`, antes de
 * AIU e IVA:
 *
 *   Ensamble ventanas y proyectantes     Σ m² de TODAS            × mo_ensamble_ventana_m2
 *   Instalación ventanas y proyectantes  Σ m² de las con instal.  × mo_instalacion_ventana_m2
 *   Instalación cabinas                  Σ piezas con instal.     × mo_instalacion_cabina_und
 *                                        (una cabina en L cuenta DOS)
 *   Instalación espejos y tableros       Σ m² de los con instal.  × mo_instalacion_espejo_tablero_m2
 *
 * m² por pieza con mínimo de 1 m². El AIU se aplica al VALOR UNITARIO
 * (`tarifa / aiu`, igual que `subtotalConAiu` de un producto), así la línea que
 * ve el cliente ya lo trae y el total cuadra renglón a renglón. Descuento e IVA
 * los aplica `calcularTotalesPropuesta`.
 *
 * ⚠️ Cambio de regla: el 2026-09-20 la mano de obra se había fijado POR UNIDAD
 * (tarifa del tipo de obra × piezas). El 2026-09-26 el usuario la redefinió por
 * producto y por m² en ventanería, espejos y tableros.
 *
 * Una línea en cero no se emite: "Instalación cabinas: 0" no le dice nada al cliente.
 */
export function calcularManoObraProductos(items: ItemParaCargos[] = []): CargoSugerido[] {
  const p = getParametros();
  const aiu = Number(p.aiu) > 0 ? Number(p.aiu) : 1;

  let m2Ventaneria = 0;
  let m2VentaneriaInstalada = 0;
  let unidadesCabina = 0;
  let cabinasEnL = 0;
  let m2EspejoTablero = 0;

  for (const it of items) {
    const modulo = String(it?.moduloId ?? '');
    const instalar = conInstalacion(it);
    if (MODULOS_VENTANERIA.has(modulo)) {
      const m2 = m2CobrablesDe(it);
      m2Ventaneria += m2;
      if (instalar) m2VentaneriaInstalada += m2;
    } else if (MODULOS_CABINA.has(modulo) && instalar) {
      const piezas = piezasDe(it);
      const enL = marcado(it?.input?.enL);
      unidadesCabina += piezas * (enL ? 2 : 1);
      if (enL) cabinasEnL += piezas;
    } else if (MODULOS_ESPEJO_TABLERO.has(modulo) && instalar) {
      m2EspejoTablero += m2CobrablesDe(it);
    }
  }

  const lineas: CargoSugerido[] = [];
  const agregar = (
    tipo: 'ENSAMBLE' | 'INSTALACION',
    descripcion: string,
    cantidad: number,
    unidad: 'M2' | 'UND',
    tarifa: number,
    detalle: string
  ) => {
    const cant = round2(cantidad);
    const t = Number(tarifa) || 0;
    if (cant <= 0 || t <= 0) return;
    lineas.push({
      tipo,
      descripcion,
      cantidad: cant,
      unidad,
      valorUnitario: round2(t / aiu),
      aplicaIva: true,
      origen: 'AUTOMATICO',
      explicacion: `${detalle} × ${pesos(t)} + AIU`,
    });
  };

  agregar('ENSAMBLE', 'Ensamble ventanas y proyectantes', m2Ventaneria, 'M2', p.mo_ensamble_ventana_m2, m2Texto(round2(m2Ventaneria)));
  agregar(
    'INSTALACION',
    'Instalación ventanas y proyectantes',
    m2VentaneriaInstalada,
    'M2',
    p.mo_instalacion_ventana_m2,
    m2Texto(round2(m2VentaneriaInstalada))
  );
  agregar(
    'INSTALACION',
    'Instalación cabinas',
    unidadesCabina,
    'UND',
    p.mo_instalacion_cabina_und,
    `${unidadesCabina} und` + (cabinasEnL ? ` (${cabinasEnL} en L, cuentan doble)` : '')
  );
  agregar(
    'INSTALACION',
    'Instalación espejos y tableros',
    m2EspejoTablero,
    'M2',
    p.mo_instalacion_espejo_tablero_m2,
    m2Texto(round2(m2EspejoTablero))
  );
  return lineas;
}

/** Un cargo recién sugerido o calculado, en la forma que espera el store para persistirlo. */
export interface CargoSugerido {
  tipo: TipoCargo;
  descripcion: string | null;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  aplicaIva: boolean;
  origen: 'SUGERIDO' | 'MANUAL' | 'AUTOMATICO';
  /** Texto para la pantalla: "4,20 m² × $60.000 + AIU". No se persiste. */
  explicacion?: string;
}

/**
 * Juego de cargos por defecto de una propuesta recién creada: el flete con la
 * tarifa fija de parámetros. La mano de obra ya no se sugiere aquí: la calcula
 * `recalcularPropuesta` desde los ítems (2026-09-26).
 *
 * Andamio, huacal y "otros" arrancan AUSENTES, no en cero. Es la misma
 * invariante que defiende la calibración del módulo ("AUSENTE ≠ CERO"): una
 * línea de andamio en $0 en la cotización impresa le dice al cliente que el
 * andamio es gratis, cuando lo que pasa es que nadie lo ha cotizado.
 */
export function sugerirCargosIniciales(): CargoSugerido[] {
  const parametros = getParametros();
  return [
    {
      tipo: 'FLETE',
      descripcion: 'Acarreo / Flete',
      cantidad: 1,
      unidad: 'GLOBAL',
      valorUnitario: round2(Number(parametros.flete_fijo) || 0),
      aplicaIva: true,
      origen: 'SUGERIDO',
    },
  ];
}

// ---------------------------------------------------------------------------
// Cadena de totales de una propuesta
// ---------------------------------------------------------------------------

function valorUnitarioDe(c: CargoParaTotales): number {
  const v = c.valor_unitario ?? c.valorUnitario;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function aplicaIvaDe(c: CargoParaTotales): boolean {
  const v = c.aplica_iva ?? c.aplicaIva;
  // Ausente = sí lleva IVA: es el caso normal y el default de la columna.
  return v === undefined || v === null ? true : Boolean(v);
}

/** Total de una línea de cargo: `cantidad × valor_unitario`, redondeado a 2.
 * Exportada porque el store la usa para escribir la columna `total` de la fila
 * y el controlador para devolver el previsualizado — el importe que se le
 * muestra al cliente se calcula en un solo sitio. */
export function totalDeCargo(c: CargoParaTotales): number {
  const cantidad = Number(c.cantidad);
  const n = Number.isFinite(cantidad) ? cantidad : 1;
  return round2(n * valorUnitarioDe(c));
}

/**
 * La cadena de totales de una propuesta. Contrato numérico cerrado con el
 * usuario el 2026-09-20, ampliado el 2026-09-26 con la mano de obra:
 *
 *   total_productos = Σ item.resultado.subtotalConAiu       (ya trae AIU)
 *   total_mano_obra = Σ cargo.total de ENSAMBLE/INSTALACION  (ya trae AIU)
 *   total_descuento = round2((total_productos + total_mano_obra) × descuento_pct)
 *   baseGravable    = total_productos + total_mano_obra − total_descuento
 *   ivaProductos    = round2(baseGravable × ivaPct)
 *
 *   cargo.total     = round2(cargo.cantidad × cargo.valor_unitario)
 *   total_cargos    = Σ cargo.total del RESTO                (fuera del AIU y del descuento)
 *   ivaCargos       = Σ (cargo.aplica_iva ? round2(cargo.total × ivaPct) : 0)
 *
 *   total_iva       = ivaProductos + ivaCargos
 *   total_total     = baseGravable + ivaProductos + total_cargos + ivaCargos
 *
 * El IVA de cada cargo se redondea POR LÍNEA y no sobre la suma: así el total
 * que ve el cliente es exactamente la suma de los renglones que tiene delante.
 * Un redondeo sobre el agregado puede diferir en un peso del renglón a renglón,
 * y ese peso es el que hace que una cotización impresa "no cuadre".
 *
 * EL CASO LEGADO (`legadoCargosEnItems = true`)
 * Son las 4 cotizaciones anteriores a este cambio. Su SMO y su flete están
 * DENTRO del blob `resultado` de cada ítem, que es una foto inmutable que no se
 * reescribe nunca (ver `aptitudOrden.ts`, "el artefacto del blob"). Si además se
 * les sumaran cargos, se cobraría dos veces lo mismo. Así que se comportan como
 * siempre: suma pura de los ítems, descuento y cargos ignorados.
 */
export function calcularTotalesPropuesta({
  items = [],
  cargos = [],
  descuentoPct = 0,
  legadoCargosEnItems = false,
  ivaPct,
}: {
  items?: ItemParaCargos[];
  cargos?: CargoParaTotales[];
  descuentoPct?: number;
  legadoCargosEnItems?: boolean;
  ivaPct?: number;
}): TotalesPropuesta {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const totalProductos = round2(items.reduce((acc, it) => acc + num(it?.resultado?.subtotalConAiu), 0));

  if (legadoCargosEnItems) {
    const iva = round2(items.reduce((acc, it) => acc + num(it?.resultado?.iva), 0));
    const total = round2(items.reduce((acc, it) => acc + num(it?.resultado?.total), 0));
    return {
      totalProductos,
      totalManoObra: 0,
      totalDescuento: 0,
      baseGravable: totalProductos,
      ivaProductos: iva,
      totalCargos: 0,
      ivaCargos: 0,
      totalIva: iva,
      totalTotal: total,
    };
  }

  const iva = Number.isFinite(Number(ivaPct)) ? Number(ivaPct) : Number(getParametros().iva);
  const pct = Number.isFinite(Number(descuentoPct)) ? Number(descuentoPct) : 0;

  // Última red del motor, igual que la que `totalizar()` tiene para el descuento
  // por ítem. El controlador ya corta esto con Zod, pero el descuento de la
  // propuesta NO pasa por `totalizar()`: si esta función se llamara desde un
  // script, una migración o un camino futuro, un 5 escrito donde iba 0,05 se
  // aplicaría como 500% y devolvería un total NEGATIVO sin una sola queja. Es
  // exactamente el fallo que se corrigió en 2026-09-12 para el otro descuento.
  if (pct < 0 || pct > 1) {
    throw new Error(
      `El descuento debe estar entre 0% y 100% (se recibió ${descuentoPct}). ` +
        'Se escribe como fracción: 0,05 para un 5%.'
    );
  }

  const manoObra = cargos.filter((c) => esCargoManoObra(c.tipo));
  const resto = cargos.filter((c) => !esCargoManoObra(c.tipo));
  const totalManoObra = round2(manoObra.reduce((acc, c) => acc + totalDeCargo(c), 0));

  const baseAntesDescuento = round2(totalProductos + totalManoObra);
  const totalDescuento = round2(baseAntesDescuento * pct);
  const baseGravable = round2(baseAntesDescuento - totalDescuento);
  const ivaProductos = round2(baseGravable * iva);

  let totalCargos = 0;
  let ivaCargos = 0;
  for (const c of resto) {
    const t = totalDeCargo(c);
    totalCargos = round2(totalCargos + t);
    if (aplicaIvaDe(c)) ivaCargos = round2(ivaCargos + round2(t * iva));
  }

  return {
    totalProductos,
    totalManoObra,
    totalDescuento,
    baseGravable,
    ivaProductos,
    totalCargos,
    ivaCargos,
    totalIva: round2(ivaProductos + ivaCargos),
    totalTotal: round2(baseGravable + ivaProductos + totalCargos + ivaCargos),
  };
}
