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
import { getParametros } from './catalogo';
import { round2, tarifaSMO } from './motorCalculo';
import type { TipoObra } from './motorCalculo';

export type TipoCargo = 'SMO' | 'ANDAMIO' | 'HUACAL' | 'FLETE' | 'OTRO';

/** Tipo de obra tal como lo elige el vendedor: los cuatro que tarifa el Excel
 * matriz más `otro`, que es monto totalmente libre y por eso no tiene tarifa. */
export type TipoObraSeleccion = TipoObra | 'otro';

export const TIPO_OBRA_LIBRE = 'otro';

/** Etiquetas legibles. Los MONTOS no viven aquí: salen de `getParametros().smo`,
 * que es editable desde la pestaña Configuración. Hardcodearlos aquí habría
 * creado una segunda tarifa que se desincroniza con la de la BD en cuanto
 * alguien la edite — exactamente el problema que ya tuvo el módulo con los
 * umbrales de `configuracion_global`. */
const ETIQUETA_TIPO_OBRA: Record<TipoObraSeleccion, string> = {
  cabinas: 'Cabinas',
  fachadas: 'Fachadas',
  armadaVentanas: 'Armada de ventanas',
  persiana: 'Persiana',
  otro: 'Otro (monto libre)',
};

/** Qué tarifa de obra le corresponde a cada módulo de producto. Es el mismo
 * criterio que tenían escrito a mano los seis módulos antes de que se les
 * quitara la línea SMO: una cabina se instala como cabina, un espejo y un
 * tablero van a fachada, y ventanas y proyectantes son ventanería. */
const TIPO_OBRA_POR_MODULO: Record<string, TipoObra> = {
  ventanas: 'armadaVentanas',
  proyectantes: 'armadaVentanas',
  'cabinas-corredizas': 'cabinas',
  'cabinas-batientes': 'cabinas',
  tablero: 'fachadas',
  espejo: 'fachadas',
};

/** Ancho a partir del cual un tablero es "pieza grande" y se le aplica el piso
 * de `smo.pisoTableroGrande`. Réplica deliberada de `UMBRAL_ANCHO_CM` de
 * `modules/tablero.ts` (celda K12/K13 del Excel original, 1,51 m): allá sigue
 * gobernando cuántas perforaciones y elevadores lleva la pieza, que es una
 * regla de materiales y no de mano de obra. Si el umbral cambia, hay que
 * moverlo en los dos sitios — están enlazados por este comentario a propósito,
 * porque unificarlos obligaría a que el módulo de producto importara el de
 * cargos o al revés, y son capas distintas. */
const UMBRAL_TABLERO_GRANDE_CM = 151;

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
  totalDescuento: number;
  /** `totalProductos − totalDescuento`: la base sobre la que corre el IVA. */
  baseGravable: number;
  ivaProductos: number;
  /** Base de los cargos, sin IVA. */
  totalCargos: number;
  ivaCargos: number;
  /** IVA de productos + IVA de cargos. */
  totalIva: number;
  totalTotal: number;
}

export interface SugerenciaSMO {
  /** Total sugerido = `cantidad × valorUnitario`. */
  monto: number;
  /** Texto que la pantalla muestra bajo el campo: "3 unidades × $60.000
   * (Armada de ventanas)". Vacío cuando no hay sugerencia posible. */
  explicacion: string;
  /** Tarifa POR UNIDAD del tipo de obra. 0 en `otro`. */
  tarifa: number;
  /** Unidades sugeridas: la suma de piezas de la propuesta. Editable en la
   * pantalla — es una sugerencia, no una imposición. */
  cantidad: number;
  /** Área total, sólo informativa. Ya NO interviene en el cálculo del SMO. */
  areaM2: number;
}

// ---------------------------------------------------------------------------
// Tipos de obra para el selector
// ---------------------------------------------------------------------------

export interface TipoObraListado {
  id: TipoObraSeleccion;
  etiqueta: string;
  /** Tarifa vigente en `cotizador.parametro`. 0 para `otro`. */
  tarifa: number;
}

/**
 * Tipos de obra para el selector de SMO, con su tarifa vigente.
 *
 * Es función y no constante a propósito: las tarifas se editan desde la pestaña
 * Configuración y una constante congelaría el valor del arranque del proceso.
 */
export function tiposObra(): TipoObraListado[] {
  const p = getParametros();
  const orden: TipoObraSeleccion[] = ['cabinas', 'fachadas', 'armadaVentanas', 'persiana', TIPO_OBRA_LIBRE];
  return orden.map((id) => ({
    id,
    etiqueta: ETIQUETA_TIPO_OBRA[id],
    tarifa: id === TIPO_OBRA_LIBRE ? 0 : tarifaSMO(p, id as TipoObra),
  }));
}

export function etiquetaTipoObra(tipoObra: string | null | undefined): string {
  if (!tipoObra) return '';
  return ETIQUETA_TIPO_OBRA[tipoObra as TipoObraSeleccion] ?? tipoObra;
}

export function esTipoObraValido(valor: unknown): valor is TipoObraSeleccion {
  return typeof valor === 'string' && valor in ETIQUETA_TIPO_OBRA;
}

// ---------------------------------------------------------------------------
// Sugerencia de mano de obra
// ---------------------------------------------------------------------------

/** Suma del área de los ítems de la propuesta.
 *
 * ⚠️ `resultado.areaM2` NO significa lo mismo en todos los módulos: ventanas,
 * proyectantes y el camino por diseño lo devuelven ya multiplicado por
 * `cantidadPiezas`, mientras que tablero y espejo devuelven el área de UNA
 * pieza. Se suma tal cual porque así lo fija el diseño de 2026-09-20 y porque
 * el monto resultante es editable por el vendedor —una sugerencia, no un
 * precio—, pero está anotado aquí para que nadie lo tome por una medida exacta
 * de metros cuadrados instalados. */
function areaTotalDe(items: ItemParaCargos[]): number {
  const suma = items.reduce((acc, it) => {
    const a = Number(it?.resultado?.areaM2);
    return acc + (Number.isFinite(a) && a > 0 ? a : 0);
  }, 0);
  return round2(suma);
}

/** ¿Hay en la propuesta algún tablero de más de 1,51 m de ancho?
 *
 * El piso de $87.000 es una regla propia de Tablero que el Excel no modela y
 * que vivía dentro de `modules/tablero.ts`. Al sacar el SMO del BOM se habría
 * perdido en silencio: se trae aquí como parte de la sugerencia, que es el sitio
 * donde hoy se decide cuánto cuesta la mano de obra. */
/**
 * Piezas totales de la propuesta: lo que se instala, que es lo que se cobra.
 *
 * `cantidadPiezas` sale del resultado del motor (y del input como respaldo, por
 * si el blob es de una versión que no lo traía). Un ítem sin el dato cuenta
 * como una pieza: es la lectura prudente, y el campo es editable.
 */
function piezasTotalesDe(items: ItemParaCargos[]): number {
  const suma = items.reduce((acc, it) => {
    const n = Number(it?.resultado?.cantidadPiezas ?? it?.input?.cantidadPiezas);
    return acc + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
  }, 0);
  return suma > 0 ? suma : 1;
}

function hayTableroGrande(items: ItemParaCargos[]): boolean {
  return items.some((it) => {
    if (it?.moduloId !== 'tablero') return false;
    const ancho = Number(it?.input?.anchoCm);
    return Number.isFinite(ancho) && ancho > UMBRAL_TABLERO_GRANDE_CM;
  });
}

/** Formatea un monto en pesos para la explicación. `Intl` con `es-CO` produce
 * "$ 60.000"; se quita el espacio para que se lea igual que en el resto del
 * módulo, donde el frontend usa `fmtCOP`. */
function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}

// Aquí vivía `m2()`, que formateaba el área para la explicación del SMO. Se fue
// con el cálculo por metro cuadrado el 2026-09-20: la mano de obra se cobra por
// unidad y la explicación ya no menciona área.

/**
 * Mano de obra sugerida para una propuesta: **tarifa POR UNIDAD × unidades**.
 *
 * ⚠️ CAMBIO DE REGLA (2026-09-20, decisión del usuario). Hasta hoy esto
 * calculaba `max(areaTotalM2 × tarifa, tarifa)`, heredado de los seis módulos,
 * y era un error de cobro: las tarifas del Excel matriz ($120.000 cabinas,
 * $85.000 fachadas, $60.000 armada de ventanas, $110.000 persiana) **no son por
 * metro cuadrado, son por unidad instalada**. Una ventana de 7,5 m² sugería
 * $450.000 de mano de obra donde correspondían $60.000.
 *
 * Ahora la sugerencia son dos números editables por separado, igual que el
 * andamio (días) y el huacal (unidades): las **unidades** —la suma de piezas de
 * la propuesta, que es lo que de verdad se instala— y el **valor unitario**. El
 * vendedor cambia cualquiera de los dos; el momento en que toca uno, el cargo
 * pasa a MANUAL y el sistema deja de proponer.
 *
 * El área deja de intervenir. Se sigue devolviendo en `areaM2` como dato
 * informativo, y con ella se va el problema de que `resultado.areaM2` no
 * signifique lo mismo en todos los módulos (ver `areaTotalDe`): el SMO ya no
 * depende de ese campo.
 *
 * Tablero grande conserva su trato aparte, pero como TARIFA y no como piso del
 * total: un tablero de más de 1,51 m se sugiere a `smo.pisoTableroGrande`
 * ($87.000) por unidad en vez de a la tarifa de fachadas ($85.000). Es la misma
 * intención de siempre —el grande cuesta más de instalar— expresada en la
 * unidad correcta.
 *
 * `otro` no tiene sugerencia: es monto libre, y devolver un número inventado
 * ahí llevaría al vendedor a aceptarlo sin pensarlo.
 */
export function sugerirSMO({
  items = [],
  tipoObra,
}: {
  items?: ItemParaCargos[];
  tipoObra?: string | null;
}): SugerenciaSMO {
  const area = areaTotalDe(items);
  const cantidad = piezasTotalesDe(items);

  if (!tipoObra || tipoObra === TIPO_OBRA_LIBRE || !esTipoObraValido(tipoObra)) {
    return { monto: 0, explicacion: '', tarifa: 0, cantidad, areaM2: area };
  }

  const parametros = getParametros();
  let tarifa = tarifaSMO(parametros, tipoObra as TipoObra);
  let nota = ETIQUETA_TIPO_OBRA[tipoObra];

  if (hayTableroGrande(items)) {
    const tarifaGrande = Number(parametros.smo?.pisoTableroGrande) || 87000;
    if (tarifaGrande > tarifa) {
      tarifa = tarifaGrande;
      nota = 'tablero de más de 1,51 m';
    }
  }

  const unidades = cantidad === 1 ? '1 unidad' : `${cantidad} unidades`;
  return {
    monto: round2(cantidad * tarifa),
    explicacion: `${unidades} × ${pesos(tarifa)} (${nota})`,
    tarifa,
    cantidad,
    areaM2: area,
  };
}

/** Tipo de obra del módulo que más ítems aporta a la propuesta. En empate gana
 * el primero, que es el orden en que el vendedor los fue agregando. */
export function tipoObraPredominante(items: ItemParaCargos[] = []): TipoObra {
  const conteo = new Map<string, number>();
  for (const it of items) {
    const id = typeof it?.moduloId === 'string' ? it.moduloId : '';
    if (!TIPO_OBRA_POR_MODULO[id]) continue;
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }
  let ganador = '';
  let max = 0;
  for (const [id, n] of conteo) {
    if (n > max) {
      max = n;
      ganador = id;
    }
  }
  return TIPO_OBRA_POR_MODULO[ganador] ?? 'armadaVentanas';
}

/** Un cargo recién sugerido, en la forma que espera el store para persistirlo. */
export interface CargoSugerido {
  tipo: TipoCargo;
  descripcion: string | null;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  aplicaIva: boolean;
  origen: 'SUGERIDO' | 'MANUAL';
  /** Sólo para SMO: qué tipo de obra se asumió, para que la pantalla preseleccione
   * el selector y pueda volver a pedir la sugerencia si el vendedor lo cambia. */
  tipoObra?: TipoObraSeleccion;
  explicacion?: string;
}

/**
 * Juego de cargos por defecto de una propuesta recién creada: mano de obra
 * según el módulo predominante, y flete con la tarifa fija de parámetros.
 *
 * Andamio, huacal y "otros" arrancan AUSENTES, no en cero. Es la misma
 * invariante que defiende la calibración del módulo ("AUSENTE ≠ CERO"): una
 * línea de andamio en $0 en la cotización impresa le dice al cliente que el
 * andamio es gratis, cuando lo que pasa es que nadie lo ha cotizado.
 */
export function sugerirCargosIniciales({ items = [] }: { items?: ItemParaCargos[] }): CargoSugerido[] {
  const parametros = getParametros();
  const tipoObra = tipoObraPredominante(items);
  const smo = sugerirSMO({ items, tipoObra });

  const cargos: CargoSugerido[] = [
    {
      tipo: 'SMO',
      descripcion: ETIQUETA_TIPO_OBRA[tipoObra],
      // Unidades y valor unitario por separado (2026-09-20). Antes iba
      // `cantidad: 1` con el total metido en `valorUnitario`, que desperdiciaba
      // las dos columnas que la tabla ya tenía y hacía ilegible la línea en la
      // cotización impresa: "1 × $450.000" no dice qué se está cobrando, y
      // "5 × $60.000" sí.
      cantidad: smo.cantidad,
      unidad: 'UND',
      valorUnitario: smo.tarifa,
      aplicaIva: true,
      origen: 'SUGERIDO',
      tipoObra,
      explicacion: smo.explicacion,
    },
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
  return cargos;
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
 * usuario el 2026-09-20:
 *
 *   total_productos = Σ item.resultado.subtotalConAiu       (ya trae AIU)
 *   total_descuento = round2(total_productos × descuento_pct)
 *   baseGravable    = total_productos − total_descuento
 *   ivaProductos    = round2(baseGravable × ivaPct)
 *
 *   cargo.total     = round2(cargo.cantidad × cargo.valor_unitario)
 *   total_cargos    = Σ cargo.total                          (fuera del AIU y del descuento)
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

  const totalDescuento = round2(totalProductos * pct);
  const baseGravable = round2(totalProductos - totalDescuento);
  const ivaProductos = round2(baseGravable * iva);

  let totalCargos = 0;
  let ivaCargos = 0;
  for (const c of cargos) {
    const t = totalDeCargo(c);
    totalCargos = round2(totalCargos + t);
    if (aplicaIvaDe(c)) ivaCargos = round2(ivaCargos + round2(t * iva));
  }

  return {
    totalProductos,
    totalDescuento,
    baseGravable,
    ivaProductos,
    totalCargos,
    ivaCargos,
    totalIva: round2(ivaProductos + ivaCargos),
    totalTotal: round2(baseGravable + ivaProductos + totalCargos + ivaCargos),
  };
}
