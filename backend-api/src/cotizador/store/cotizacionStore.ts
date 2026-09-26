// Persistencia de las cotizaciones del módulo Cotizador.
//
// Sustituye al `db/store.js` del origen, que guardaba un array en un archivo
// JSON. Conserva la forma de la API (cliente anidado, `items[]`, `totales`)
// porque es la que consume el frontend, pero por debajo la cabecera vive
// aplanada en columnas —el listado filtra por substring sobre el nombre del
// cliente y la obra— y los ítems en su tabla hija.
//
// DESDE EL 2026-09-20 LA JERARQUÍA ES cotización → PROPUESTA → ítem.
// Una cotización es un contenedor de propuestas (A/B/C…): el mismo cliente y la
// misma obra cotizados de varias maneras. El total de la cotización es el de la
// propuesta ELEGIDA, y de ella —solo de ella— sale la orden de corte. Los cargos
// de obra (mano de obra, andamio, huacal, flete) cuelgan de la propuesta porque
// se cobran una vez, no una por pieza: ese era el bug que originó el cambio.
//
// Cuatro decisiones que no son negociables:
//
// 1. EL LISTADO NUNCA DEVUELVE LOS BLOBS. Cada ítem guarda un JSONB
//    `resultado` de ~4,5 KB con el despiece completo; devolverlo en un listado
//    de 50 cotizaciones serían 200 KB por pantallazo contra un egress diario
//    de 50-60 MB. Para eso existen las columnas espejo que creó la Etapa 1
//    (`diseno_id`, `sistema`, `apto_para_corte`, totales…): permiten listar,
//    contar y filtrar sin tocar un solo blob.
//
// 2. `obtener()` TRAE LOS BLOBS DE UNA SOLA PROPUESTA. Con propuestas, "traer
//    el detalle entero" multiplicaría el peso por el número de variantes. Se
//    trae completa la propuesta ACTIVA (por defecto, la elegida) y el resto
//    viene en modo ligero con `COLUMNAS_ITEM_LIGERO`.
//
// 3. LOS TOTALES YA NO SON UNA SUMA. `calcularTotales` delega en
//    `calcularTotalesPropuesta` de `lib/cargos.ts`, que aplica descuento e IVA
//    a los productos y suma los cargos aparte (fuera del AIU y del descuento).
//    Esa aritmética vive en un solo sitio: aquí no se replica.
//
// 4. EL NÚMERO SALE DE UN CONTADOR CON ROW-LOCK, no de `max(numero)+1`. Ese
//    patrón es un read-then-write clásico: dos vendedores guardando a la vez
//    leen el mismo máximo y ambos escriben el mismo número. Ver `siguienteNumero`.
import { isDeepStrictEqual } from 'util';
import { QueryTypes, Op, Transaction } from 'sequelize';
import {
  sequelize,
  CotizadorCotizacion,
  CotizadorCotizacionItem,
  CotizadorPropuesta,
  CotizadorPropuestaCargo,
} from '../../models';
import {
  calcularManoObraProductos,
  calcularTotalesPropuesta,
  esCargoManoObra,
  sugerirCargosIniciales,
  totalDeCargo,
  type CargoParaTotales,
  type ItemParaCargos,
  type TipoCargo,
} from '../lib/cargos';
import { calcularItem, getModulo } from '../modules/registry';

/** Error de negocio con el código HTTP que le corresponde y un mensaje ya
 * redactado para el vendedor. El controlador sólo lo traduce a respuesta: así
 * la regla ("no se puede borrar la última propuesta") vive junto al dato que la
 * hace cierta, y no repartida entre cinco handlers. */
export class ErrorCotizador extends Error {
  constructor(
    readonly estado: number,
    mensaje: string
  ) {
    super(mensaje);
    this.name = 'ErrorCotizador';
  }
}

export interface ClienteCotizacion {
  nombre?: string;
  direccion?: string | null;
  telefono?: string | null;
  obra?: string | null;
  contacto?: string | null;
}

export interface ItemEntrada {
  moduloId?: string;
  descripcionItem?: string | null;
  input?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultado?: Record<string, any> | null;
}

export interface CargoEntrada {
  tipo: TipoCargo;
  descripcion?: string | null;
  cantidad?: number;
  unidad?: string;
  valorUnitario?: number;
  aplicaIva?: boolean;
  origen?: string;
}

export interface PropuestaEntrada {
  nombre?: string | null;
  nota?: string | null;
  elegida?: boolean;
  descuentoPct?: number;
  items?: ItemEntrada[];
  /** Ausente = se sugiere el juego por defecto (mano de obra + flete). Un
   * arreglo vacío = el vendedor decidió que no lleva cargos. AUSENTE ≠ VACÍO,
   * la misma invariante que defiende la calibración del módulo. */
  cargos?: CargoEntrada[];
}

export interface CotizacionEntrada {
  cliente?: ClienteCotizacion;
  segmentoCliente?: string;
  asesor?: string;
  /** LEGADO: la cabecera ya no guarda descuento. Si llega (contrato viejo del
   * frontend), se aplica a la propuesta que se esté escribiendo. */
  descuentoPct?: number;
  estado?: string;
  /** Contrato viejo: ítems planos. Se guardan en la propuesta A / en la activa. */
  items?: ItemEntrada[];
  /** Contrato nuevo: varias propuestas de una vez. */
  propuestas?: PropuestaEntrada[];
  /** A qué propuesta van los `items` planos al actualizar. Por defecto, la elegida. */
  propuestaId?: number;
}

export interface FiltrosListado {
  cliente?: string;
  estado?: string;
  asesor?: string;
  numero?: string | number;
  q?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Máximo de propuestas por cotización. Cinco no es un número técnico: es el
 * punto donde el comparador deja de caber en una pantalla girada hacia el
 * cliente, que es para lo que existe. */
export const MAX_PROPUESTAS = 5;
const ETIQUETAS = ['A', 'B', 'C', 'D', 'E'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

/**
 * Totales de una propuesta. Ya NO es una suma de los ítems: aplica el descuento
 * de la propuesta sobre los productos y añade los cargos por fuera del AIU y del
 * descuento, con su propio IVA. El contrato numérico completo (incluido el caso
 * legado) vive en `lib/cargos.ts`; aquí sólo se adapta la forma de las filas.
 *
 * Se conserva el nombre y la forma de salida (`{subtotal, iva, total}`) porque
 * es lo que consumen la cabecera y el frontend.
 */
export function calcularTotales(
  items: ItemEntrada[] = [],
  {
    cargos = [],
    descuentoPct = 0,
    legadoCargosEnItems = false,
  }: { cargos?: CargoParaTotales[]; descuentoPct?: number; legadoCargosEnItems?: boolean } = {}
) {
  const t = calcularTotalesPropuesta({ items, cargos, descuentoPct, legadoCargosEnItems });
  return {
    subtotal: t.totalProductos,
    descuento: t.totalDescuento,
    cargos: t.totalCargos,
    iva: t.totalIva,
    total: t.totalTotal,
    detalle: t,
  };
}

/** Campos que se copian del `resultado` a columnas propias para poder listar
 * y filtrar sin leer el JSONB. Se escriben aquí, en un solo sitio, para que no
 * puedan quedar desalineados con el blob que describen. */
function espejoDe(it: ItemEntrada) {
  const r = it.resultado ?? {};
  return {
    diseno_id: r.diseno?.id ?? null,
    sistema: r.diseno?.sistema ?? null,
    nivel_corte: r.diseno?.nivelCorte ?? null,
    apto_para_corte: Boolean(r.aptoParaCorte),
    hay_errores: Boolean(r.hayErrores),
    cantidad_piezas: Number(r.cantidadPiezas ?? 1),
    subtotal_con_aiu: Number(r.subtotalConAiu ?? 0),
    iva: Number(r.iva ?? 0),
    total: Number(r.total ?? 0),
  };
}

/**
 * REGLA 4 AMPLIADA (2026-09-23): la propuesta elegida de una cotización
 * APROBADA no se toca — ni sus ítems, ni su descuento, ni sus cargos. Es el
 * mismo motivo por el que ya no se podía cambiar ni borrar: puede haber
 * material cortado con lo que se aprobó. Para cambiarla, primero se le quita la
 * aprobación.
 */
function exigirPropuestaEditable(cot: Fila, propuesta: Fila, accion: string) {
  if (cot.estado === 'APROBADA' && propuesta.elegida) {
    throw new ErrorCotizador(
      409,
      `Esta cotización está aprobada: para ${accion} de la propuesta ${propuesta.etiqueta} primero hay que pasarla a Pendiente. ` +
        'Puede haber material cortado con lo que se aprobó.'
    );
  }
}

/**
 * El segmento (PA/PM/PB) es de la COTIZACIÓN, no del ítem (2026-09-23). Cada
 * ítem guarda el suyo en `input.segmentoCliente` porque es con el que el motor
 * lo preció; si no coincide con el de la cotización, esa mezcla se rechaza en
 * vez de guardarse en silencio con precios de dos listas distintas.
 *
 * Un ítem sin el dato no se juzga: no hay con qué compararlo.
 */
function exigirMismoSegmento(items: ItemEntrada[], segmento: string) {
  for (const [i, it] of items.entries()) {
    const s = it.input?.segmentoCliente;
    if (typeof s === 'string' && s !== segmento) {
      const nombre = it.descripcionItem?.trim() || `el ítem ${i + 1}`;
      throw new ErrorCotizador(
        400,
        `"${nombre}" está calculado con precios ${s} y la cotización es ${segmento}. ` +
          'Recalcula los ítems con el segmento de la cotización antes de guardar.'
      );
    }
  }
}

function aCotizacion(fila: Fila, items: Fila[] | null, propuestas: Fila[] | null, propuestaActivaId: number | null) {
  const salida: Fila = {
    id: fila.id,
    numero: fila.numero,
    version: fila.version,
    estado: fila.estado,
    creadaEn: fila.creada_en,
    actualizadaEn: fila.actualizada_en,
    cliente: {
      nombre: fila.cliente_nombre,
      direccion: fila.cliente_direccion,
      telefono: fila.cliente_telefono,
      obra: fila.cliente_obra,
      contacto: fila.cliente_contacto,
    },
    segmentoCliente: fila.segmento_cliente,
    asesor: fila.asesor,
    // ⚠️ LEGADO: la columna se conserva con sus 4 filas históricas pero ya no se
    // escribe. El descuento vivo es `propuesta.descuentoPct`. Se sigue emitiendo
    // para no romper a quien la lea todavía.
    descuentoPct: fila.descuento_pct,
    totales: {
      subtotal: fila.total_subtotal,
      iva: fila.total_iva,
      total: fila.total_total,
    },
  };
  if (propuestas) {
    salida.propuestas = propuestas;
    const elegida = propuestas.find((p) => p.elegida);
    salida.propuestaElegidaId = elegida ? elegida.id : null;
    salida.propuestaActivaId = propuestaActivaId;
  }
  if (items) salida.items = items.map(aItem);
  return salida;
}

function aItem(fila: Fila) {
  const item: Fila = {
    id: fila.id,
    propuestaId: fila.propuesta_id,
    orden: fila.orden,
    moduloId: fila.modulo_id,
    descripcionItem: fila.descripcion_item,
    disenoId: fila.diseno_id,
    sistema: fila.sistema,
    nivelCorte: fila.nivel_corte,
    aptoParaCorte: fila.apto_para_corte,
    hayErrores: fila.hay_errores,
    cantidadPiezas: fila.cantidad_piezas,
    subtotalConAiu: fila.subtotal_con_aiu,
    iva: fila.iva,
    total: fila.total,
  };
  // Sólo cuando se pidieron: el listado y las propuestas no activas no los traen.
  if ('input' in fila) item.input = fila.input;
  if ('resultado' in fila) item.resultado = fila.resultado;
  return item;
}

function aCargo(fila: Fila) {
  return {
    id: fila.id,
    propuestaId: fila.propuesta_id,
    orden: fila.orden,
    tipo: fila.tipo,
    descripcion: fila.descripcion,
    cantidad: fila.cantidad,
    unidad: fila.unidad,
    valorUnitario: fila.valor_unitario,
    total: fila.total,
    aplicaIva: fila.aplica_iva,
    origen: fila.origen,
  };
}

function aPropuesta(fila: Fila, cargos: Fila[] | null, items: Fila[] | null) {
  const p: Fila = {
    id: fila.id,
    cotizacionId: fila.cotizacion_id,
    etiqueta: fila.etiqueta,
    nombre: fila.nombre,
    nota: fila.nota,
    elegida: fila.elegida,
    descuentoPct: fila.descuento_pct,
    legadoCargosEnItems: fila.legado_cargos_en_items,
    totales: {
      productos: fila.total_productos,
      manoObra: fila.total_mano_obra ?? 0,
      descuento: fila.total_descuento,
      cargos: fila.total_cargos,
      iva: fila.total_iva,
      total: fila.total_total,
    },
    creadaEn: fila.creada_en,
    actualizadaEn: fila.actualizada_en,
  };
  if (cargos) p.cargos = cargos.map(aCargo);
  if (items) p.items = items.map(aItem);
  return p;
}

/** Columnas del ítem que NO incluyen los dos JSONB pesados. */
const COLUMNAS_ITEM_LIGERO = [
  'id',
  'cotizacion_id',
  'propuesta_id',
  'orden',
  'modulo_id',
  'descripcion_item',
  'diseno_id',
  'sistema',
  'nivel_corte',
  'apto_para_corte',
  'hay_errores',
  'cantidad_piezas',
  'subtotal_con_aiu',
  'iva',
  'total',
];

/** Las tres columnas espejo que alimentan la cadena de totales. Se leen en vez
 * del JSONB `resultado` a propósito: recalcular los totales de una propuesta no
 * necesita el despiece, y traerlo costaría 4,5 KB por ítem cada vez que alguien
 * toca un cargo. */
const COLUMNAS_ITEM_TOTALES = ['subtotal_con_aiu', 'iva', 'total'];

function filasATotalizables(filas: Fila[]) {
  return filas.map((f) => ({
    resultado: {
      subtotalConAiu: Number(f.subtotal_con_aiu ?? 0),
      iva: Number(f.iva ?? 0),
      total: Number(f.total ?? 0),
    },
  }));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Listado con filtros combinables (AND), igual que el origen: `cliente` y `q`
 * son substring, `asesor` y `estado` igualdad exacta (salen de listas cerradas
 * de parámetros, no hay variantes de escritura que tolerar) y `numero` exacto
 * porque es un identificador, no un texto a buscar.
 *
 * Devuelve los ítems SIN `input` ni `resultado`, y las propuestas SIN sus ítems
 * ni sus cargos: sólo la cabecera y los totales espejo, que es lo que necesita
 * la pestaña Guardadas para pintar el rango de una cotización sin decidir
 * ("$1,1 M – $1,8 M · sin elegir").
 */
export async function listar(filtros: FiltrosListado = {}) {
  const where: Fila = {};
  if (filtros.estado) where.estado = filtros.estado;
  if (filtros.asesor) where.asesor = filtros.asesor;
  if (filtros.numero !== undefined && filtros.numero !== '') {
    where.numero = Number(filtros.numero);
  }
  if (filtros.cliente) {
    where.cliente_nombre = { [Op.iLike]: `%${filtros.cliente}%` };
  }
  if (filtros.q) {
    const q = `%${filtros.q}%`;
    const condiciones: Fila[] = [
      { cliente_nombre: { [Op.iLike]: q } },
      { cliente_obra: { [Op.iLike]: q } },
    ];
    // `numero` es INTEGER: sólo se compara si la búsqueda es numérica, para
    // no pedirle a Postgres un cast que fallaría con texto libre.
    const comoNumero = Number(filtros.q);
    if (Number.isInteger(comoNumero)) condiciones.push({ numero: comoNumero });
    where[Op.or as unknown as string] = condiciones;
  }

  const cabeceras = (await CotizadorCotizacion.findAll({
    where,
    order: [['numero', 'DESC']],
    raw: true,
  })) as unknown as Fila[];

  if (cabeceras.length === 0) return [];
  const ids = cabeceras.map((c) => c.id);

  const [items, propuestas] = await Promise.all([
    CotizadorCotizacionItem.findAll({
      where: { cotizacion_id: ids },
      attributes: COLUMNAS_ITEM_LIGERO,
      order: [
        ['cotizacion_id', 'ASC'],
        ['orden', 'ASC'],
      ],
      raw: true,
    }) as unknown as Promise<Fila[]>,
    CotizadorPropuesta.findAll({
      where: { cotizacion_id: ids },
      order: [
        ['cotizacion_id', 'ASC'],
        ['etiqueta', 'ASC'],
      ],
      raw: true,
    }) as unknown as Promise<Fila[]>,
  ]);

  const itemsPorCot = agrupar(items, 'cotizacion_id');
  const propsPorCot = agrupar(propuestas, 'cotizacion_id');

  return cabeceras.map((c) => {
    const props = (propsPorCot.get(c.id) ?? []).map((p) => aPropuesta(p, null, null));
    return aCotizacion(c, itemsPorCot.get(c.id) ?? [], props, null);
  });
}

function agrupar(filas: Fila[], clave: string): Map<number, Fila[]> {
  const mapa = new Map<number, Fila[]>();
  for (const f of filas) {
    const k = f[clave];
    const lista = mapa.get(k);
    if (lista) lista.push(f);
    else mapa.set(k, [f]);
  }
  return mapa;
}

/**
 * Cotización completa.
 *
 * Trae los blobs (`input`/`resultado`) de UNA sola propuesta: la que se pida por
 * `propuesta`, y si no, la elegida; si no hay elegida, la primera. El resto de
 * propuestas viene con sus ítems en modo ligero. Sin esta regla, cuatro
 * propuestas multiplican por cuatro el peso del detalle, y el detalle es la
 * pantalla que más se abre del módulo.
 *
 * Al pedir `propuesta` se devuelve también `propuestaActivaId` para que el
 * cliente sepa cuál de las listas trae despiece.
 */
export async function obtener(id: number, { propuesta }: { propuesta?: number | string } = {}) {
  const fila = (await CotizadorCotizacion.findByPk(id, { raw: true })) as unknown as Fila | null;
  if (!fila) return null;

  const propuestas = (await CotizadorPropuesta.findAll({
    where: { cotizacion_id: id },
    order: [['etiqueta', 'ASC']],
    raw: true,
  })) as unknown as Fila[];

  const pedida = Number(propuesta);
  const activa =
    propuestas.find((p) => p.id === pedida) ??
    propuestas.find((p) => p.elegida) ??
    propuestas[0] ??
    null;
  const activaId: number | null = activa ? activa.id : null;

  const idsPropuesta = propuestas.map((p) => p.id);
  const [cargos, itemsCompletos, itemsLigeros] = await Promise.all([
    idsPropuesta.length
      ? (CotizadorPropuestaCargo.findAll({
          where: { propuesta_id: idsPropuesta },
          order: [
            ['propuesta_id', 'ASC'],
            ['orden', 'ASC'],
            ['id', 'ASC'],
          ],
          raw: true,
        }) as unknown as Promise<Fila[]>)
      : Promise.resolve([] as Fila[]),
    activaId !== null
      ? (CotizadorCotizacionItem.findAll({
          where: { propuesta_id: activaId },
          order: [['orden', 'ASC']],
          raw: true,
        }) as unknown as Promise<Fila[]>)
      : Promise.resolve([] as Fila[]),
    idsPropuesta.length
      ? (CotizadorCotizacionItem.findAll({
          where: {
            propuesta_id: activaId === null ? idsPropuesta : { [Op.ne]: activaId },
            cotizacion_id: id,
          },
          attributes: COLUMNAS_ITEM_LIGERO,
          order: [
            ['propuesta_id', 'ASC'],
            ['orden', 'ASC'],
          ],
          raw: true,
        }) as unknown as Promise<Fila[]>)
      : Promise.resolve([] as Fila[]),
  ]);

  const cargosPorProp = agrupar(cargos, 'propuesta_id');
  const itemsPorProp = agrupar([...itemsCompletos, ...itemsLigeros], 'propuesta_id');

  const propuestasSalida = propuestas.map((p) =>
    aPropuesta(p, cargosPorProp.get(p.id) ?? [], itemsPorProp.get(p.id) ?? [])
  );

  // `items` en la raíz = los de la propuesta activa, con sus blobs. Es lo que
  // esperan el carrito del frontend, el plano de un ítem y la aptitud: el
  // "carrito" pasó a ser, literalmente, la propuesta que se está mirando.
  // Cuando la cotización no tiene ninguna propuesta (no debería pasar tras la
  // migración, pero un dato viejo no se descarta) se cae a los ítems colgados
  // directamente de la cotización.
  const itemsRaiz = propuestas.length
    ? itemsCompletos
    : ((await CotizadorCotizacionItem.findAll({
        where: { cotizacion_id: id },
        order: [['orden', 'ASC']],
        raw: true,
      })) as unknown as Fila[]);

  return aCotizacion(fila, itemsRaiz, propuestasSalida, activaId);
}

/** Tabla comparativa de las propuestas de una cotización: la pantalla que se
 * gira hacia el cliente. La diferencia se mide siempre contra la PRIMERA
 * propuesta (la A), no contra la elegida: la A es la que el cliente ya vio, y
 * comparar contra un ancla que se mueve al elegir haría saltar los números. */
export async function comparar(id: number) {
  const cab = (await CotizadorCotizacion.findByPk(id, { raw: true })) as unknown as Fila | null;
  if (!cab) return null;

  const propuestas = (await CotizadorPropuesta.findAll({
    where: { cotizacion_id: id },
    order: [['etiqueta', 'ASC']],
    raw: true,
  })) as unknown as Fila[];

  const idsPropuesta = propuestas.map((p) => p.id);
  const [cargos, conteos] = await Promise.all([
    idsPropuesta.length
      ? (CotizadorPropuestaCargo.findAll({
          where: { propuesta_id: idsPropuesta },
          order: [
            ['propuesta_id', 'ASC'],
            ['orden', 'ASC'],
          ],
          raw: true,
        }) as unknown as Promise<Fila[]>)
      : Promise.resolve([] as Fila[]),
    idsPropuesta.length
      ? (CotizadorCotizacionItem.findAll({
          where: { propuesta_id: idsPropuesta },
          attributes: ['id', 'propuesta_id', 'descripcion_item', 'modulo_id', 'cantidad_piezas', 'total'],
          order: [
            ['propuesta_id', 'ASC'],
            ['orden', 'ASC'],
          ],
          raw: true,
        }) as unknown as Promise<Fila[]>)
      : Promise.resolve([] as Fila[]),
  ]);

  const cargosPorProp = agrupar(cargos, 'propuesta_id');
  const itemsPorProp = agrupar(conteos, 'propuesta_id');
  const base = propuestas[0];
  const totalBase = base ? Number(base.total_total ?? 0) : 0;

  return {
    cotizacionId: cab.id,
    numero: cab.numero,
    estado: cab.estado,
    baseEtiqueta: base ? base.etiqueta : null,
    propuestas: propuestas.map((p) => {
      const total = Number(p.total_total ?? 0);
      const diferencia = round2(total - totalBase);
      return {
        id: p.id,
        etiqueta: p.etiqueta,
        nombre: p.nombre,
        nota: p.nota,
        elegida: p.elegida,
        descuentoPct: p.descuento_pct,
        cantidadItems: (itemsPorProp.get(p.id) ?? []).length,
        totales: {
          productos: p.total_productos,
          manoObra: p.total_mano_obra ?? 0,
          descuento: p.total_descuento,
          cargos: p.total_cargos,
          iva: p.total_iva,
          total: p.total_total,
        },
        cargos: (cargosPorProp.get(p.id) ?? []).map(aCargo),
        diferencia,
        // Porcentaje sobre la A. Sin base no hay porcentaje: dividir por cero
        // daría `Infinity` y el frontend lo pintaría como "∞ %".
        diferenciaPct: totalBase > 0 ? round2((diferencia / totalBase) * 100) : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Escritura — helpers internos
// ---------------------------------------------------------------------------

/**
 * Siguiente número de cotización, sin condición de carrera.
 *
 * `UPDATE ... RETURNING` toma un row-lock sobre la fila del contador: dos
 * creadores concurrentes se encolan en vez de leer el mismo valor, y un
 * rollback DEVUELVE el número en vez de dejar un hueco. Se descartaron
 * `max(numero)+1` (read-then-write) y `SERIAL` (deja huecos visibles, y en un
 * documento comercial que el cliente numera eso se nota).
 */
async function siguienteNumero(t: Transaction): Promise<number> {
  const filas = (await sequelize.query(
    `UPDATE cotizador.consecutivo SET valor = valor + 1 WHERE nombre = 'cotizacion' RETURNING valor;`,
    { transaction: t, type: QueryTypes.SELECT }
  )) as unknown as Array<{ valor: number }>;
  if (!filas.length) {
    throw new Error('No existe el contador de cotizaciones (cotizador.consecutivo).');
  }
  return filas[0].valor;
}

/** Primera etiqueta libre de A…E. La asigna el backend y nunca el cliente: si
 * la eligiera el frontend, dos pestañas abiertas crearían dos "B". */
function siguienteEtiqueta(usadas: string[]): string {
  const libre = ETIQUETAS.find((e) => !usadas.includes(e));
  if (!libre) {
    throw new ErrorCotizador(
      409,
      `Una cotización admite como máximo ${MAX_PROPUESTAS} propuestas. Borra alguna de las que ya tiene antes de crear otra.`
    );
  }
  return libre;
}

function filaCargo(c: CargoEntrada, orden: number) {
  const cantidad = Number(c.cantidad);
  const valorUnitario = Number(c.valorUnitario);
  const normalizado = {
    orden,
    tipo: c.tipo,
    descripcion: c.descripcion ?? null,
    cantidad: Number.isFinite(cantidad) ? cantidad : 1,
    unidad: c.unidad ?? 'GLOBAL',
    valor_unitario: Number.isFinite(valorUnitario) ? valorUnitario : 0,
    aplica_iva: c.aplicaIva === undefined ? true : Boolean(c.aplicaIva),
    origen: c.origen === 'SUGERIDO' || c.origen === 'AUTOMATICO' ? c.origen : 'MANUAL',
  };
  return { ...normalizado, total: totalDeCargo(normalizado) };
}

/** Inserta el juego de cargos de una propuesta. Uno a uno y no con `bulkCreate`:
 * los hooks de auditoría son de instancia y una alta en bloque no los dispara,
 * así que el precio de la mano de obra entraría sin dejar rastro. */
async function insertarCargos(propuestaId: number, cargos: CargoEntrada[], t: Transaction) {
  // La mano de obra por producto (ENSAMBLE / INSTALACION) NUNCA entra desde
  // afuera: la genera `recalcularPropuesta` desde los ítems. Si el cliente o una
  // copia de propuesta la trae, se descarta aquí y se regenera allá.
  const manuales = cargos.filter((c) => !esCargoManoObra(c.tipo));
  for (const [i, c] of manuales.entries()) {
    await CotizadorPropuestaCargo.create(
      { propuesta_id: propuestaId, ...filaCargo(c, i) } as Fila,
      { transaction: t }
    );
  }
}

/** Clave de comparación de una línea de mano de obra: si no cambió nada, no se
 * reescribe (cada fila está auditada y reescribirla ensuciaría el log). */
function claveManoObra(c: { tipo: unknown; descripcion: unknown; cantidad: unknown; valor_unitario?: unknown; valorUnitario?: unknown }) {
  return [c.tipo, c.descripcion, Number(c.cantidad), Number(c.valor_unitario ?? c.valorUnitario)].join('|');
}

/**
 * Deja las líneas automáticas de mano de obra (ENSAMBLE / INSTALACION) de una
 * propuesta alineadas con sus ítems (2026-09-26). Solo toca la BD si cambió
 * algo. Van después de los cargos manuales (orden 100+) para que el panel y el
 * PDF las muestren juntas.
 */
async function sincronizarManoObra(propuestaId: number, items: Fila[], t: Transaction) {
  const nuevas = calcularManoObraProductos(
    items.map((f): ItemParaCargos => ({ moduloId: f.modulo_id, input: f.input ?? {} }))
  );
  const existentes = (await CotizadorPropuestaCargo.findAll({
    where: { propuesta_id: propuestaId, tipo: ['ENSAMBLE', 'INSTALACION'] },
    order: [['orden', 'ASC']],
    transaction: t,
  })) as unknown as Fila[];

  const iguales =
    existentes.length === nuevas.length &&
    existentes.every((e, i) => claveManoObra(e.get({ plain: true })) === claveManoObra(nuevas[i]));
  if (iguales) return;

  // Uno a uno y no con un `destroy` en bloque: los hooks de auditoría son de instancia.
  for (const e of existentes) await e.destroy({ transaction: t });
  for (const [i, c] of nuevas.entries()) {
    await CotizadorPropuestaCargo.create(
      { propuesta_id: propuestaId, ...filaCargo(c as CargoEntrada, 100 + i) } as Fila,
      { transaction: t }
    );
  }
}

/**
 * Recalcula los totales espejo de una propuesta y los guarda.
 *
 * Lee sólo las columnas espejo de los ítems (no el JSONB del despiece) y todos
 * sus cargos. Es el único sitio que escribe `total_*` de la propuesta: cualquier
 * operación que toque ítems, cargos o descuento termina llamando aquí.
 */
async function recalcularPropuesta(propuestaId: number, t: Transaction) {
  const propuesta = (await CotizadorPropuesta.findByPk(propuestaId, { transaction: t })) as Fila | null;
  if (!propuesta) return null;
  const legado = Boolean(propuesta.legado_cargos_en_items);

  // `input` y `modulo_id` se leen para la mano de obra por producto: el input
  // es el formulario (medidas, piezas, casillas), unos cientos de bytes. El
  // JSONB pesado, `resultado`, sigue sin leerse.
  const items = (await CotizadorCotizacionItem.findAll({
    where: { propuesta_id: propuestaId },
    attributes: [...COLUMNAS_ITEM_TOTALES, 'modulo_id', 'input'],
    raw: true,
    transaction: t,
  })) as unknown as Fila[];

  if (!legado) await sincronizarManoObra(propuestaId, items, t);

  const cargos = (await CotizadorPropuestaCargo.findAll({
    where: { propuesta_id: propuestaId },
    attributes: ['tipo', 'cantidad', 'valor_unitario', 'total', 'aplica_iva'],
    raw: true,
    transaction: t,
  })) as unknown as Fila[];

  const totales = calcularTotalesPropuesta({
    items: filasATotalizables(items),
    cargos: cargos as CargoParaTotales[],
    descuentoPct: Number(propuesta.descuento_pct ?? 0),
    legadoCargosEnItems: Boolean(propuesta.legado_cargos_en_items),
  });

  await propuesta.update(
    {
      total_productos: totales.totalProductos,
      total_mano_obra: totales.totalManoObra,
      total_descuento: totales.totalDescuento,
      total_cargos: totales.totalCargos,
      total_iva: totales.totalIva,
      total_total: totales.totalTotal,
      actualizada_en: new Date(),
    },
    { transaction: t }
  );
  return totales;
}

/**
 * Copia a la cabecera los totales de la propuesta ELEGIDA.
 *
 * El total de la cotización ES el de la propuesta elegida. Se denormaliza para
 * que el listado siga filtrando y ordenando sin abrir las propuestas. Sin
 * elegida, los espejos quedan en cero a propósito: un total inventado (el de la
 * A, por ejemplo) haría que el listado muestre como definitivo un precio que
 * nadie ha escogido. La pestaña Guardadas pinta el RANGO en ese caso, leyendo
 * `propuestas[]`.
 */
async function sincronizarCabecera(cotizacionId: number, t: Transaction) {
  const cot = (await CotizadorCotizacion.findByPk(cotizacionId, { transaction: t })) as Fila | null;
  if (!cot) return;
  const elegida = (await CotizadorPropuesta.findOne({
    where: { cotizacion_id: cotizacionId, elegida: true },
    transaction: t,
    raw: true,
  })) as unknown as Fila | null;

  await cot.update(
    {
      // Productos + mano de obra (2026-09-26): los dos llevan AIU y descuento,
      // y son lo que el listado muestra como "subtotal" antes de cargos e IVA.
      total_subtotal: elegida ? Number(elegida.total_productos ?? 0) + Number(elegida.total_mano_obra ?? 0) : 0,
      total_iva: elegida ? Number(elegida.total_iva ?? 0) : 0,
      total_total: elegida ? Number(elegida.total_total ?? 0) : 0,
      actualizada_en: new Date(),
    },
    { transaction: t }
  );
}

async function propuestasDe(cotizacionId: number, t?: Transaction): Promise<Fila[]> {
  return (await CotizadorPropuesta.findAll({
    where: { cotizacion_id: cotizacionId },
    order: [['etiqueta', 'ASC']],
    raw: true,
    transaction: t,
  })) as unknown as Fila[];
}

/** Carga la cotización y la propuesta pedida validando que la segunda pertenezca
 * a la primera. Un `pid` de otra cotización es un error del cliente, no un 404
 * genérico: se responde que esa propuesta no es de esa cotización. */
async function cargarPropuesta(cotizacionId: number, propuestaId: number, t: Transaction) {
  const cot = (await CotizadorCotizacion.findByPk(cotizacionId, { transaction: t })) as Fila | null;
  if (!cot) throw new ErrorCotizador(404, 'Cotización no encontrada.');
  const propuesta = (await CotizadorPropuesta.findByPk(propuestaId, { transaction: t })) as Fila | null;
  if (!propuesta || Number(propuesta.cotizacion_id) !== Number(cotizacionId)) {
    throw new ErrorCotizador(404, 'Esa propuesta no existe en esta cotización.');
  }
  return { cot, propuesta };
}

/** Reconcilia los ítems de UNA propuesta por `orden` (upsert), NUNCA borrando y
 * recreando: Sequelize omite el UPDATE cuando `changed()` está vacío, así que un
 * ítem que no se tocó no dispara el hook de auditoría y no genera una fila más.
 * Con delete+insert, guardar dos veces una propuesta de 8 ítems escribiría 16
 * filas de auditoría con sus blobs, sin que nada hubiera cambiado.
 *
 * Devuelve si algo cambió de verdad. El frontend reenvía la lista COMPLETA en
 * cada guardado (también cuando sólo se corrigió el teléfono del cliente), así
 * que el freno de la cotización aprobada necesita distinguir "reenvió lo mismo"
 * de "cambió un ítem". La comparación es profunda e insensible al orden de las
 * claves, que Postgres no conserva en JSONB. */
async function reconciliarItems(
  cotizacionId: number,
  propuestaId: number,
  items: ItemEntrada[],
  t: Transaction
): Promise<boolean> {
  let huboCambios = false;
  const existentes = (await CotizadorCotizacionItem.findAll({
    where: { propuesta_id: propuestaId },
    transaction: t,
  })) as unknown as Array<
    Fila & { update: (v: Fila, o: Fila) => Promise<unknown>; destroy: (o: Fila) => Promise<unknown> }
  >;
  const porOrden = new Map(existentes.map((e) => [e.orden as number, e]));

  for (const [i, it] of items.entries()) {
    const valores: Fila = {
      modulo_id: it.moduloId ?? '',
      descripcion_item: it.descripcionItem ?? null,
      input: it.input ?? {},
      resultado: it.resultado ?? {},
      ...espejoDe(it),
    };
    const existente = porOrden.get(i);
    if (existente) {
      porOrden.delete(i);
      const igual =
        (existente.modulo_id ?? '') === valores.modulo_id &&
        (existente.descripcion_item ?? null) === valores.descripcion_item &&
        isDeepStrictEqual(existente.input ?? {}, valores.input) &&
        isDeepStrictEqual(existente.resultado ?? {}, valores.resultado);
      if (igual) continue;
      huboCambios = true;
      await existente.update(valores, { transaction: t });
    } else {
      huboCambios = true;
      await CotizadorCotizacionItem.create(
        { cotizacion_id: cotizacionId, propuesta_id: propuestaId, orden: i, ...valores } as Fila,
        { transaction: t }
      );
    }
  }
  // Los que sobran (la propuesta perdió ítems) sí se borran.
  for (const sobrante of porOrden.values()) {
    huboCambios = true;
    await sobrante.destroy({ transaction: t });
  }
  return huboCambios;
}

/** Crea una propuesta con sus ítems y sus cargos dentro de una transacción ya
 * abierta. Devuelve el id. */
async function crearPropuestaInterna(
  cotizacionId: number,
  etiqueta: string,
  entrada: PropuestaEntrada,
  t: Transaction
): Promise<number> {
  const ahora = new Date();
  const propuesta = (await CotizadorPropuesta.create(
    {
      cotizacion_id: cotizacionId,
      etiqueta,
      nombre: entrada.nombre ?? null,
      nota: entrada.nota ?? null,
      elegida: Boolean(entrada.elegida),
      descuento_pct: Number(entrada.descuentoPct) || 0,
      legado_cargos_en_items: false,
      creada_en: ahora,
      actualizada_en: ahora,
    } as Fila,
    { transaction: t }
  )) as unknown as Fila;

  const items = entrada.items ?? [];
  for (const [i, it] of items.entries()) {
    await CotizadorCotizacionItem.create(
      {
        cotizacion_id: cotizacionId,
        propuesta_id: propuesta.id,
        orden: i,
        modulo_id: it.moduloId ?? '',
        descripcion_item: it.descripcionItem ?? null,
        input: it.input ?? {},
        resultado: it.resultado ?? {},
        ...espejoDe(it),
      } as Fila,
      { transaction: t }
    );
  }

  // AUSENTE ≠ VACÍO: si no llegan cargos se sugiere el juego por defecto (el
  // flete). Un arreglo vacío explícito significa "esta propuesta no lleva
  // cargos" y se respeta. Una propuesta sin ítems no recibe sugerencia. La mano
  // de obra no se sugiere: la genera `recalcularPropuesta` desde los ítems.
  const cargos = entrada.cargos ?? (items.length ? sugerirCargosIniciales() : []);
  await insertarCargos(propuesta.id, cargos as CargoEntrada[], t);

  await recalcularPropuesta(propuesta.id, t);
  return propuesta.id;
}

// ---------------------------------------------------------------------------
// Escritura — API pública
// ---------------------------------------------------------------------------

/**
 * Crea una cotización.
 *
 * Acepta las dos formas, y las dos tienen que seguir funcionando:
 *  - `items: [...]` (contrato actual del frontend) → se crea la propuesta A con
 *    esos ítems, elegida, y el `descuentoPct` de la cabecera se aplica a ella.
 *  - `propuestas: [...]` (forma nueva) → se crean en orden, con etiquetas A…E.
 *
 * Si ninguna propuesta viene marcada como elegida, se elige la primera: una
 * cotización con una sola propuesta la tiene elegida por definición.
 */
export async function crear(datos: CotizacionEntrada) {
  const entradas: PropuestaEntrada[] =
    datos.propuestas && datos.propuestas.length
      ? datos.propuestas
      : [{ items: datos.items ?? [], descuentoPct: datos.descuentoPct ?? 0, elegida: true }];

  if (entradas.length > MAX_PROPUESTAS) {
    throw new ErrorCotizador(
      409,
      `Una cotización admite como máximo ${MAX_PROPUESTAS} propuestas y llegaron ${entradas.length}.`
    );
  }
  if (!entradas.some((p) => p.elegida)) entradas[0].elegida = true;
  // La regla "solo una elegida" la impone un índice único parcial de Postgres:
  // dejar pasar dos aquí no corrompería el dato, pero fallaría con un error de
  // base que el vendedor no puede leer. Mejor decírselo en su idioma.
  if (entradas.filter((p) => p.elegida).length > 1) {
    throw new ErrorCotizador(400, 'Solo una propuesta puede quedar marcada como elegida.');
  }
  const segmento = datos.segmentoCliente ?? 'PA';
  for (const entrada of entradas) exigirMismoSegmento(entrada.items ?? [], segmento);

  const ahora = new Date();
  const t = await sequelize.transaction();
  try {
    const numero = await siguienteNumero(t);
    const cot = (await CotizadorCotizacion.create(
      {
        numero,
        version: 1,
        estado: datos.estado ?? 'PENDIENTE',
        creada_en: ahora,
        actualizada_en: ahora,
        cliente_nombre: datos.cliente?.nombre ?? '',
        cliente_direccion: datos.cliente?.direccion ?? null,
        cliente_telefono: datos.cliente?.telefono ?? null,
        cliente_obra: datos.cliente?.obra ?? null,
        cliente_contacto: datos.cliente?.contacto ?? null,
        segmento_cliente: segmento,
        asesor: datos.asesor ?? '',
        // Columna legada: se deja en 0 a propósito. El descuento vivo está en
        // la propuesta. Ver el comentario de `aCotizacion`.
        descuento_pct: 0,
        total_subtotal: 0,
        total_iva: 0,
        total_total: 0,
      } as Fila,
      { transaction: t }
    )) as unknown as Fila;

    for (const [i, entrada] of entradas.entries()) {
      await crearPropuestaInterna(cot.id, ETIQUETAS[i], entrada, t);
    }
    await sincronizarCabecera(cot.id, t);

    await t.commit();
    return await obtener(cot.id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Actualiza una cotización. Sube `version` y conserva `id` y `numero`, igual
 * que el origen.
 *
 * Los `items` planos del contrato viejo van a la propuesta indicada en
 * `propuestaId` y, si no llega, a la elegida — que es la que el frontend está
 * mostrando. El `descuentoPct` de la cabecera se aplica a esa misma propuesta.
 */
export async function actualizar(id: number, datos: CotizacionEntrada) {
  const t = await sequelize.transaction();
  try {
    const cot = (await CotizadorCotizacion.findByPk(id, { transaction: t })) as Fila | null;
    if (!cot) {
      await t.rollback();
      return null;
    }

    const cambios: Fila = { actualizada_en: new Date() };
    if (datos.cliente !== undefined) {
      cambios.cliente_nombre = datos.cliente?.nombre ?? '';
      cambios.cliente_direccion = datos.cliente?.direccion ?? null;
      cambios.cliente_telefono = datos.cliente?.telefono ?? null;
      cambios.cliente_obra = datos.cliente?.obra ?? null;
      cambios.cliente_contacto = datos.cliente?.contacto ?? null;
    }
    // El segmento de una cotización YA GUARDADA no se cambia por aquí: cambiarlo
    // sin recalcular dejaría los ítems de todas sus propuestas con precios de
    // otra lista. Para eso está `cambiarSegmento()`, que recalcula todo junto.
    if (datos.segmentoCliente !== undefined && datos.segmentoCliente !== cot.segmento_cliente) {
      throw new ErrorCotizador(
        409,
        `Esta cotización está en ${cot.segmento_cliente}. Para pasarla a ${datos.segmentoCliente} usa el cambio de segmento, ` +
          'que recalcula los ítems de todas sus propuestas con los precios nuevos.'
      );
    }
    if (datos.items !== undefined) exigirMismoSegmento(datos.items, cot.segmento_cliente);
    if (datos.asesor !== undefined) cambios.asesor = datos.asesor;
    if (datos.estado !== undefined) cambios.estado = datos.estado;

    // REGLA 5: no se aprueba una cotización sin propuesta elegida. Aprobar es lo
    // que habilita la orden de corte, y sin elegida no hay UN juego de medidas
    // que mandar al taller: hay varios. Se comprueba antes de escribir nada.
    if (datos.estado === 'APROBADA') {
      const hayElegida = await CotizadorPropuesta.findOne({
        where: { cotizacion_id: id, elegida: true },
        transaction: t,
      });
      if (!hayElegida) {
        throw new ErrorCotizador(
          400,
          'Para aprobar esta cotización primero hay que elegir una propuesta: es la que se le cobra al cliente y la que se manda a cortar.'
        );
      }
    }

    // La propuesta sobre la que se guarda. Se resuelve también cuando llega
    // `propuestaId` sin ítems, porque no sirve solo para escribir: es la que hay
    // que DEVOLVER. `obtener(id)` a secas responde con los blobs de la elegida,
    // así que guardar la propuesta B devolvía los ítems de la A y el carrito del
    // vendedor saltaba de propuesta al guardar.
    let idDestino: number | null = null;
    if (datos.items !== undefined || datos.descuentoPct !== undefined || datos.propuestaId !== undefined) {
      const propuestas = await propuestasDe(id, t);
      const destino =
        propuestas.find((p) => p.id === Number(datos.propuestaId)) ??
        propuestas.find((p) => p.elegida) ??
        propuestas[0];
      if (!destino) {
        throw new ErrorCotizador(
          409,
          'Esta cotización no tiene ninguna propuesta donde guardar los ítems. Crea una antes de continuar.'
        );
      }
      idDestino = Number(destino.id);
      let huboCambios = false;
      if (datos.descuentoPct !== undefined) {
        const nuevo = Number(datos.descuentoPct) || 0;
        if ((Number(destino.descuento_pct) || 0) !== nuevo) {
          huboCambios = true;
          const fila = (await CotizadorPropuesta.findByPk(destino.id, { transaction: t })) as Fila;
          await fila.update({ descuento_pct: nuevo }, { transaction: t });
        }
      }
      if (datos.items !== undefined) {
        huboCambios = (await reconciliarItems(id, destino.id, datos.items, t)) || huboCambios;
      }
      // Se evalúa DESPUÉS de reconciliar porque sólo ahí se sabe si algo cambió
      // de verdad; si cambió, el throw deshace lo escrito con el rollback. Quitar
      // la aprobación en este mismo guardado sí libera la edición.
      const sigueAprobada = (datos.estado ?? cot.estado) === 'APROBADA';
      if (huboCambios && sigueAprobada) {
        exigirPropuestaEditable(cot, destino, 'cambiar los ítems o el descuento');
      }
      await recalcularPropuesta(destino.id, t);
    }

    cambios.version = (Number(cot.version) || 1) + 1;
    await cot.update(cambios, { transaction: t });
    await sincronizarCabecera(id, t);

    await t.commit();
    return await obtener(id, idDestino ? { propuesta: idDestino } : {});
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

export async function eliminar(id: number): Promise<boolean> {
  const t = await sequelize.transaction();
  try {
    const cot = (await CotizadorCotizacion.findByPk(id, { transaction: t })) as Fila | null;
    if (!cot) {
      await t.rollback();
      return false;
    }
    // Ítems, cargos y propuestas se borran de uno en uno y no con un
    // `destroy({where})` masivo: los hooks de auditoría son de instancia y una
    // baja en bloque no los dispara, así que el borrado pasaría sin dejar
    // rastro. El ON DELETE CASCADE de la base haría lo mismo, y peor: ni
    // siquiera pasaría por Sequelize.
    const items = (await CotizadorCotizacionItem.findAll({
      where: { cotizacion_id: id },
      transaction: t,
    })) as unknown as Array<{ destroy: (o: Fila) => Promise<unknown> }>;
    for (const it of items) await it.destroy({ transaction: t });

    const propuestas = (await CotizadorPropuesta.findAll({
      where: { cotizacion_id: id },
      transaction: t,
    })) as unknown as Array<Fila & { destroy: (o: Fila) => Promise<unknown> }>;
    for (const p of propuestas) {
      const cargos = (await CotizadorPropuestaCargo.findAll({
        where: { propuesta_id: p.id },
        transaction: t,
      })) as unknown as Array<{ destroy: (o: Fila) => Promise<unknown> }>;
      for (const c of cargos) await c.destroy({ transaction: t });
      await p.destroy({ transaction: t });
    }

    await cot.destroy({ transaction: t });
    await t.commit();
    return true;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Propuestas
// ---------------------------------------------------------------------------

/** Crea una propuesta: vacía, o copia exacta de otra si llega `desdePropuestaId`
 * (misma lista de ítems, mismos cargos, mismo descuento). La copia NO recalcula:
 * para eso está `clonarPropuesta`, que sí pasa los ítems por el motor. */
export async function crearPropuesta(
  cotizacionId: number,
  {
    nombre,
    nota,
    descuentoPct,
    desdePropuestaId,
  }: { nombre?: string | null; nota?: string | null; descuentoPct?: number; desdePropuestaId?: number }
) {
  const t = await sequelize.transaction();
  try {
    const cot = (await CotizadorCotizacion.findByPk(cotizacionId, { transaction: t })) as Fila | null;
    if (!cot) throw new ErrorCotizador(404, 'Cotización no encontrada.');

    const existentes = await propuestasDe(cotizacionId, t);
    const etiqueta = siguienteEtiqueta(existentes.map((p) => p.etiqueta));

    let entrada: PropuestaEntrada = {
      nombre: nombre ?? null,
      nota: nota ?? null,
      descuentoPct: descuentoPct ?? 0,
      // Primera propuesta de la cotización = elegida por definición (regla 2).
      elegida: existentes.length === 0,
    };

    if (desdePropuestaId !== undefined) {
      const origen = existentes.find((p) => p.id === Number(desdePropuestaId));
      if (!origen) throw new ErrorCotizador(404, 'La propuesta que quieres copiar no existe en esta cotización.');
      const [items, cargos] = await Promise.all([
        CotizadorCotizacionItem.findAll({
          where: { propuesta_id: origen.id },
          order: [['orden', 'ASC']],
          raw: true,
          transaction: t,
        }) as unknown as Promise<Fila[]>,
        CotizadorPropuestaCargo.findAll({
          where: { propuesta_id: origen.id },
          order: [['orden', 'ASC']],
          raw: true,
          transaction: t,
        }) as unknown as Promise<Fila[]>,
      ]);
      entrada = {
        ...entrada,
        nombre: nombre ?? (origen.nombre ? `${origen.nombre} (copia)` : null),
        nota: nota ?? origen.nota,
        descuentoPct: descuentoPct ?? Number(origen.descuento_pct ?? 0),
        items: items.map((f) => ({
          moduloId: f.modulo_id,
          descripcionItem: f.descripcion_item,
          input: f.input ?? {},
          resultado: f.resultado ?? {},
        })),
        cargos: cargos.map(aCargoEntrada),
      };
    }

    const id = await crearPropuestaInterna(cotizacionId, etiqueta, entrada, t);
    await sincronizarCabecera(cotizacionId, t);
    await t.commit();
    return { propuestaId: id, cotizacion: await obtener(cotizacionId, { propuesta: id }) };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

function aCargoEntrada(f: Fila): CargoEntrada {
  return {
    tipo: f.tipo,
    descripcion: f.descripcion,
    cantidad: Number(f.cantidad ?? 1),
    unidad: f.unidad ?? 'GLOBAL',
    valorUnitario: Number(f.valor_unitario ?? 0),
    aplicaIva: f.aplica_iva === undefined ? true : Boolean(f.aplica_iva),
    origen: f.origen,
  };
}

/** Campos del input que el clonado puede cambiar de golpe en todos los ítems. */
const CAMPOS_CLONABLES = ['codigoVidrio', 'pelicula', 'matizado'] as const;
export type CambiosClonado = Partial<Record<(typeof CAMPOS_CLONABLES)[number], unknown>>;

/** ¿El módulo de este ítem declara ese campo en su formulario?
 *
 * Es la forma data-driven de saber si un cambio aplica: `meta.campos` ES el
 * contrato del módulo. Cabinas y espejo, por ejemplo, no tienen `codigoVidrio`
 * (el vidrio sale del espesor), así que pedirles un cambio de vidrio no es un
 * error del vendedor —es una combinación que ese producto no ofrece— y se avisa
 * en vez de fallar. */
function moduloAcepta(moduloId: string, campo: string): boolean {
  const modulo = getModulo(moduloId);
  const campos = (modulo?.meta?.campos ?? []) as Array<{ nombre?: string }>;
  return campos.some((c) => c?.nombre === campo);
}

/**
 * Clona una propuesta cambiando vidrio / película / matizado de TODOS sus ítems
 * de una vez, y recalculándolos con el motor a partir de su `input` original.
 *
 * Es la razón de ser de las propuestas: cotizar la misma obra en 5 mm y en
 * templado sin que el carrito las sume como si el cliente comprara las dos.
 *
 * NO BLOQUEA, AVISA. Un ítem que el motor no pueda recalcular —o que salga con
 * líneas en error, que es lo que pasa con los dos vidrios que hoy están a $0 en
 * el catálogo— no cancela la operación: la propuesta se crea igual y la
 * respuesta trae `advertencias` para que la pantalla las muestre. Cancelar
 * obligaría al vendedor a arreglar el catálogo antes de poder enseñar una
 * alternativa, y el catálogo no es suyo.
 */
export async function clonarPropuesta(
  cotizacionId: number,
  propuestaId: number,
  { cambios = {}, nombre, nota }: { cambios?: CambiosClonado; nombre?: string | null; nota?: string | null }
) {
  const advertencias: string[] = [];
  const t = await sequelize.transaction();
  try {
    const { propuesta: origen } = await cargarPropuesta(cotizacionId, propuestaId, t);
    const existentes = await propuestasDe(cotizacionId, t);
    const etiqueta = siguienteEtiqueta(existentes.map((p) => p.etiqueta));

    const [items, cargos] = await Promise.all([
      CotizadorCotizacionItem.findAll({
        where: { propuesta_id: origen.id },
        order: [['orden', 'ASC']],
        raw: true,
        transaction: t,
      }) as unknown as Promise<Fila[]>,
      CotizadorPropuestaCargo.findAll({
        where: { propuesta_id: origen.id },
        order: [['orden', 'ASC']],
        raw: true,
        transaction: t,
      }) as unknown as Promise<Fila[]>,
    ]);

    const itemsNuevos: ItemEntrada[] = items.map((f) => {
      const moduloId: string = f.modulo_id ?? '';
      const etiquetaItem = f.descripcion_item || `${moduloId} #${(Number(f.orden) || 0) + 1}`;
      const input = { ...(f.input ?? {}) };

      const aplicados: string[] = [];
      for (const campo of CAMPOS_CLONABLES) {
        if (!(campo in cambios)) continue;
        if (!moduloAcepta(moduloId, campo)) {
          advertencias.push(
            `"${etiquetaItem}" no admite cambiar ${nombreLegible(campo)}: se copió tal como estaba.`
          );
          continue;
        }
        input[campo] = cambios[campo];
        aplicados.push(campo);
      }

      const modulo = getModulo(moduloId);
      if (!modulo || aplicados.length === 0) {
        // Sin cambios que aplicar (o sin motor donde aplicarlos) el ítem se copia
        // con su blob intacto. Recalcularlo "por si acaso" reescribiría una foto
        // que hoy es fiel a lo que se le cotizó al cliente.
        if (!modulo && aplicados.length === 0 && Object.keys(cambios).length > 0) {
          advertencias.push(`El módulo "${moduloId}" ya no existe: "${etiquetaItem}" se copió sin recalcular.`);
        }
        return {
          moduloId,
          descripcionItem: f.descripcion_item,
          input: f.input ?? {},
          resultado: f.resultado ?? {},
        };
      }

      try {
        // Por `calcularItem` y no por `modulo.calcular`: conserva la
        // personalización del ítem (chapa cambiada, perfil agregado…).
        const resultado = calcularItem(moduloId, input);
        if (resultado?.hayErrores) {
          const lineas = (resultado.items ?? []) as Array<{ error?: boolean; descripcion?: string }>;
          const motivo = lineas.find((l) => l.error)?.descripcion ?? 'hay líneas sin precio';
          advertencias.push(`"${etiquetaItem}" quedó con errores de precio: ${motivo}`);
        }
        for (const aviso of (resultado?.advertencias ?? []) as string[]) {
          advertencias.push(`"${etiquetaItem}": ${aviso}`);
        }
        return { moduloId, descripcionItem: f.descripcion_item, input, resultado };
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : 'no se pudo recalcular';
        advertencias.push(`"${etiquetaItem}" no se pudo recalcular (${mensaje}): se copió tal como estaba.`);
        return {
          moduloId,
          descripcionItem: f.descripcion_item,
          input: f.input ?? {},
          resultado: f.resultado ?? {},
        };
      }
    });

    const id = await crearPropuestaInterna(
      cotizacionId,
      etiqueta,
      {
        nombre: nombre ?? (origen.nombre ? `${origen.nombre} (variante)` : `Variante de ${origen.etiqueta}`),
        nota: nota ?? origen.nota,
        descuentoPct: Number(origen.descuento_pct ?? 0),
        elegida: false,
        items: itemsNuevos,
        // Los cargos se copian tal cual: cambiar el vidrio no cambia lo que
        // cuesta instalarlo ni lo que cuesta el flete.
        cargos: cargos.map(aCargoEntrada),
      },
      t
    );

    await sincronizarCabecera(cotizacionId, t);
    await t.commit();
    return {
      propuestaId: id,
      advertencias,
      cotizacion: await obtener(cotizacionId, { propuesta: id }),
    };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Cambia el segmento (PA/PM/PB) de una cotización guardada y RECALCULA con el
 * motor todos los ítems de TODAS sus propuestas (2026-09-23).
 *
 * Tiene que ser aquí y no en el navegador: el carrito sólo tiene la propuesta
 * activa, así que recalcular allá dejaría las demás con precios de la lista
 * vieja y la cotización mezclando PA con PB.
 *
 * ATÓMICO, a diferencia de `clonarPropuesta`: el recálculo lo dispara el
 * vendedor al cambiar un select, sin revisar ítem por ítem, así que si uno no
 * se puede recalcular no se cambia NADA. Un ítem que sí se recalcula pero queda
 * sin precio en la lista nueva se guarda igual (es un dato del catálogo, no un
 * fallo del cálculo) y vuelve en `advertencias`.
 *
 * Rechaza la cotización aprobada (regla 4) y la que tenga una propuesta legada:
 * en esas, el SMO y el flete viven dentro del BOM de cada ítem, y recalcular con
 * el motor actual los sacaría del precio sin avisar.
 */
export async function cambiarSegmento(
  cotizacionId: number,
  segmento: string,
  { propuestaActiva }: { propuestaActiva?: number } = {}
) {
  const advertencias: string[] = [];
  const t = await sequelize.transaction();
  try {
    const cot = (await CotizadorCotizacion.findByPk(cotizacionId, { transaction: t })) as Fila | null;
    if (!cot) throw new ErrorCotizador(404, 'Cotización no encontrada.');

    if (cot.segmento_cliente !== segmento) {
      if (cot.estado === 'APROBADA') {
        throw new ErrorCotizador(
          409,
          'Esta cotización está aprobada: para cambiarle el segmento primero hay que pasarla a Pendiente. ' +
            'Puede haber material cortado con lo que se aprobó.'
        );
      }
      const propuestas = await propuestasDe(cotizacionId, t);
      const legada = propuestas.find((p) => p.legado_cargos_en_items);
      if (legada) {
        throw new ErrorCotizador(
          409,
          `La propuesta ${legada.etiqueta} es anterior al cambio de cargos: su mano de obra y su flete están dentro del precio de los ítems ` +
            'y recalcularla los sacaría. Duplícala a la forma nueva y borra la legada antes de cambiar el segmento.'
        );
      }

      for (const p of propuestas) {
        const items = (await CotizadorCotizacionItem.findAll({
          where: { propuesta_id: p.id },
          order: [['orden', 'ASC']],
          transaction: t,
        })) as unknown as Array<Fila & { update: (v: Fila, o: Fila) => Promise<unknown> }>;

        for (const f of items) {
          const moduloId: string = f.modulo_id ?? '';
          const etiquetaItem = f.descripcion_item || `${moduloId} #${(Number(f.orden) || 0) + 1}`;
          const modulo = getModulo(moduloId);
          if (!modulo) {
            throw new ErrorCotizador(
              409,
              `"${etiquetaItem}" (propuesta ${p.etiqueta}) es de un producto que ya no existe en el cotizador: ` +
                'no se puede recalcular, así que no se cambió el segmento.'
            );
          }
          const input = { ...(f.input ?? {}), segmentoCliente: segmento };
          let resultado: Record<string, unknown>;
          try {
            resultado = calcularItem(moduloId, input);
          } catch (e) {
            const motivo = e instanceof Error ? e.message : 'error desconocido';
            throw new ErrorCotizador(
              409,
              `No se pudo recalcular "${etiquetaItem}" (propuesta ${p.etiqueta}) con precios ${segmento}: ${motivo}. ` +
                'No se cambió nada.'
            );
          }
          if (resultado?.hayErrores) {
            const lineas = (resultado.items ?? []) as Array<{ error?: boolean; descripcion?: string }>;
            const motivo = lineas.find((l) => l.error)?.descripcion ?? 'hay líneas sin precio';
            advertencias.push(`"${etiquetaItem}" (propuesta ${p.etiqueta}) quedó con errores de precio: ${motivo}`);
          }
          await f.update(
            {
              input,
              resultado,
              ...espejoDe({ moduloId, descripcionItem: f.descripcion_item, input, resultado }),
            },
            { transaction: t }
          );
        }
        await recalcularPropuesta(p.id, t);
      }

      await cot.update(
        { segmento_cliente: segmento, version: (Number(cot.version) || 1) + 1, actualizada_en: new Date() },
        { transaction: t }
      );
      await sincronizarCabecera(cotizacionId, t);
    }

    await t.commit();
    return {
      advertencias,
      cotizacion: await obtener(cotizacionId, propuestaActiva ? { propuesta: propuestaActiva } : {}),
    };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

function nombreLegible(campo: string): string {
  if (campo === 'codigoVidrio') return 'el vidrio';
  if (campo === 'pelicula') return 'la película';
  if (campo === 'matizado') return 'el matizado';
  return campo;
}

/** Cambia nombre, nota y/o descuento de una propuesta. El descuento obliga a
 * recalcular sus totales y los de la cabecera si es la elegida. */
export async function actualizarPropuesta(
  cotizacionId: number,
  propuestaId: number,
  datos: { nombre?: string | null; nota?: string | null; descuentoPct?: number }
) {
  const t = await sequelize.transaction();
  try {
    const { cot, propuesta } = await cargarPropuesta(cotizacionId, propuestaId, t);
    if (
      datos.descuentoPct !== undefined &&
      (Number(propuesta.descuento_pct) || 0) !== (Number(datos.descuentoPct) || 0)
    ) {
      exigirPropuestaEditable(cot, propuesta, 'cambiar el descuento');
    }
    const cambios: Fila = { actualizada_en: new Date() };
    if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
    if (datos.nota !== undefined) cambios.nota = datos.nota;
    if (datos.descuentoPct !== undefined) cambios.descuento_pct = Number(datos.descuentoPct) || 0;
    await propuesta.update(cambios, { transaction: t });

    if (datos.descuentoPct !== undefined) {
      await recalcularPropuesta(propuestaId, t);
      await sincronizarCabecera(cotizacionId, t);
    }
    await t.commit();
    return await obtener(cotizacionId, { propuesta: propuestaId });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Marca una propuesta como la elegida.
 *
 * Se desmarca la anterior y se marca la nueva DENTRO de la misma transacción,
 * en ese orden: el índice único parcial de Postgres
 * (`UNIQUE (cotizacion_id) WHERE elegida`) prohíbe que existan dos a la vez, así
 * que marcar primero fallaría siempre.
 *
 * Con la cotización APROBADA se rechaza: puede haber salido ya material a corte
 * con las medidas de la propuesta actual, y cambiarla por debajo dejaría el
 * taller cortando una cosa y la factura diciendo otra.
 */
export async function elegirPropuesta(cotizacionId: number, propuestaId: number) {
  const t = await sequelize.transaction();
  try {
    const { cot, propuesta } = await cargarPropuesta(cotizacionId, propuestaId, t);
    if (cot.estado === 'APROBADA' && !propuesta.elegida) {
      throw new ErrorCotizador(
        409,
        'Esta cotización ya está aprobada: para cambiar la propuesta elegida primero hay que quitarle la aprobación. ' +
          'Puede haber material cortado con las medidas de la propuesta actual.'
      );
    }
    if (!propuesta.elegida) {
      const anterior = (await CotizadorPropuesta.findOne({
        where: { cotizacion_id: cotizacionId, elegida: true },
        transaction: t,
      })) as Fila | null;
      if (anterior) await anterior.update({ elegida: false, actualizada_en: new Date() }, { transaction: t });
      await propuesta.update({ elegida: true, actualizada_en: new Date() }, { transaction: t });
    }
    await sincronizarCabecera(cotizacionId, t);
    await t.commit();
    return await obtener(cotizacionId, { propuesta: propuestaId });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Borra una propuesta.
 *
 * Dos frenos: no se puede quedar sin ninguna (toda cotización tiene al menos
 * una), y no se puede borrar la elegida de una cotización aprobada, por el mismo
 * motivo que no se puede cambiar (ver `elegirPropuesta`).
 *
 * Si al borrar la elegida queda exactamente una, esa pasa a ser la elegida: una
 * cotización con una sola propuesta la tiene elegida por definición. Si quedan
 * varias, ninguna queda elegida y el vendedor decide — inventar cuál era la
 * buena sería peor que dejarlo explícito.
 */
export async function eliminarPropuesta(cotizacionId: number, propuestaId: number) {
  const t = await sequelize.transaction();
  try {
    const { cot, propuesta } = await cargarPropuesta(cotizacionId, propuestaId, t);
    const todas = await propuestasDe(cotizacionId, t);
    if (todas.length <= 1) {
      throw new ErrorCotizador(
        409,
        'No se puede borrar la única propuesta de la cotización. Si quieres empezar de cero, edita sus ítems o borra la cotización entera.'
      );
    }
    if (cot.estado === 'APROBADA' && propuesta.elegida) {
      throw new ErrorCotizador(
        409,
        'Esta cotización está aprobada y esta es la propuesta elegida: primero hay que quitarle la aprobación. ' +
          'Puede haber material cortado con sus medidas.'
      );
    }

    const eraElegida = Boolean(propuesta.elegida);
    const items = (await CotizadorCotizacionItem.findAll({
      where: { propuesta_id: propuestaId },
      transaction: t,
    })) as unknown as Array<{ destroy: (o: Fila) => Promise<unknown> }>;
    for (const it of items) await it.destroy({ transaction: t });
    const cargos = (await CotizadorPropuestaCargo.findAll({
      where: { propuesta_id: propuestaId },
      transaction: t,
    })) as unknown as Array<{ destroy: (o: Fila) => Promise<unknown> }>;
    for (const c of cargos) await c.destroy({ transaction: t });
    await propuesta.destroy({ transaction: t });

    if (eraElegida) {
      const quedan = await propuestasDe(cotizacionId, t);
      if (quedan.length === 1) {
        const unica = (await CotizadorPropuesta.findByPk(quedan[0].id, { transaction: t })) as Fila;
        await unica.update({ elegida: true, actualizada_en: new Date() }, { transaction: t });
      }
    }
    await sincronizarCabecera(cotizacionId, t);
    await t.commit();
    return await obtener(cotizacionId);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Reemplaza el juego COMPLETO de cargos de una propuesta.
 *
 * Es un PUT y no un PATCH por línea a propósito: el panel de cargos es un
 * formulario que el vendedor edita entero (marca andamio, cambia los días,
 * quita el huacal) y guarda de una vez. Reconciliar línea por línea obligaría al
 * frontend a llevar ids de filas que para él son casillas de un formulario.
 *
 * Se borra y se recrea, y aquí sí es correcto: a diferencia de los ítems —cuyo
 * blob de despiece pesa 4,5 KB y cuya auditoría importa fila a fila—, un cargo
 * son seis números. El rastro de auditoría queda igual (los hooks son de
 * instancia y el borrado va de uno en uno).
 */
export async function guardarCargos(cotizacionId: number, propuestaId: number, cargos: CargoEntrada[]) {
  const t = await sequelize.transaction();
  try {
    const { cot, propuesta } = await cargarPropuesta(cotizacionId, propuestaId, t);
    exigirPropuestaEditable(cot, propuesta, 'cambiar los cargos de obra');
    if (propuesta.legado_cargos_en_items) {
      throw new ErrorCotizador(
        409,
        'Esta propuesta es anterior al cambio de cargos: su mano de obra y su flete están dentro del precio de cada ítem. ' +
          'Añadirle cargos cobraría lo mismo dos veces. Duplícala para trabajar con la forma nueva.'
      );
    }

    // Solo los cargos manuales: la mano de obra automática la mantiene
    // `recalcularPropuesta`, y borrarla aquí la reescribiría en cada guardado.
    const existentes = (await CotizadorPropuestaCargo.findAll({
      where: { propuesta_id: propuestaId },
      transaction: t,
    })) as unknown as Array<{ tipo: string; get: (k: string) => unknown; destroy: (o: Fila) => Promise<unknown> }>;
    for (const c of existentes) {
      if (!esCargoManoObra(c.get('tipo'))) await c.destroy({ transaction: t });
    }
    await insertarCargos(propuestaId, cargos, t);

    await recalcularPropuesta(propuestaId, t);
    await sincronizarCabecera(cotizacionId, t);
    await t.commit();
    return await obtener(cotizacionId, { propuesta: propuestaId });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

