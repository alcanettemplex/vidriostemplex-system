// Persistencia de las cotizaciones del módulo Cotizador.
//
// Sustituye al `db/store.js` del origen, que guardaba un array en un archivo
// JSON. Conserva la forma de la API (cliente anidado, `items[]`, `totales`)
// porque es la que consume el frontend, pero por debajo la cabecera vive
// aplanada en columnas —el listado filtra por substring sobre el nombre del
// cliente y la obra— y los ítems en su tabla hija.
//
// Dos decisiones que no son negociables:
//
// 1. EL LISTADO NUNCA DEVUELVE LOS BLOBS. Cada ítem guarda un JSONB
//    `resultado` de ~4,5 KB con el despiece completo; devolverlo en un listado
//    de 50 cotizaciones serían 200 KB por pantallazo contra un egress diario
//    de 50-60 MB. Para eso existen las columnas espejo que creó la Etapa 1
//    (`diseno_id`, `sistema`, `apto_para_corte`, totales…): permiten listar,
//    contar y filtrar sin tocar un solo blob. `obtener()` sí lo trae entero.
//
// 2. EL NÚMERO SALE DE UN CONTADOR CON ROW-LOCK, no de `max(numero)+1`. Ese
//    patrón es un read-then-write clásico: dos vendedores guardando a la vez
//    leen el mismo máximo y ambos escriben el mismo número. Ver `siguienteNumero`.
import { QueryTypes, Op, Transaction } from 'sequelize';
import {
  sequelize,
  CotizadorCotizacion,
  CotizadorCotizacionItem,
} from '../../models';

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

export interface CotizacionEntrada {
  cliente?: ClienteCotizacion;
  segmentoCliente?: string;
  asesor?: string;
  descuentoPct?: number;
  estado?: string;
  items?: ItemEntrada[];
}

export interface FiltrosListado {
  cliente?: string;
  estado?: string;
  asesor?: string;
  numero?: string | number;
  q?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Totales de la cotización: se suman los de cada ítem ya calculados por el
 * motor. No se recalculan aquí — el motor es el único que sabe aplicar AIU,
 * descuento e IVA en el orden correcto. */
export function calcularTotales(items: ItemEntrada[] = []) {
  const subtotal = items.reduce((acc, it) => acc + (it.resultado?.subtotalConAiu ?? 0), 0);
  const iva = items.reduce((acc, it) => acc + (it.resultado?.iva ?? 0), 0);
  const total = items.reduce((acc, it) => acc + (it.resultado?.total ?? 0), 0);
  return { subtotal: round2(subtotal), iva: round2(iva), total: round2(total) };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

function aCotizacion(fila: Fila, items: Fila[] | null) {
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
    descuentoPct: fila.descuento_pct,
    totales: {
      subtotal: fila.total_subtotal,
      iva: fila.total_iva,
      total: fila.total_total,
    },
  };
  if (items) salida.items = items.map(aItem);
  return salida;
}

function aItem(fila: Fila) {
  const item: Fila = {
    id: fila.id,
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
  // Sólo cuando se pidieron: el listado no los trae.
  if ('input' in fila) item.input = fila.input;
  if ('resultado' in fila) item.resultado = fila.resultado;
  return item;
}

/** Columnas del ítem que NO incluyen los dos JSONB pesados. */
const COLUMNAS_ITEM_LIGERO = [
  'id',
  'cotizacion_id',
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

/**
 * Listado con filtros combinables (AND), igual que el origen: `cliente` y `q`
 * son substring, `asesor` y `estado` igualdad exacta (salen de listas cerradas
 * de parámetros, no hay variantes de escritura que tolerar) y `numero` exacto
 * porque es un identificador, no un texto a buscar.
 *
 * Devuelve los ítems SIN `input` ni `resultado`.
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

  const items = (await CotizadorCotizacionItem.findAll({
    where: { cotizacion_id: cabeceras.map((c) => c.id) },
    attributes: COLUMNAS_ITEM_LIGERO,
    order: [
      ['cotizacion_id', 'ASC'],
      ['orden', 'ASC'],
    ],
    raw: true,
  })) as unknown as Fila[];

  const porCotizacion = new Map<number, Fila[]>();
  for (const it of items) {
    const lista = porCotizacion.get(it.cotizacion_id);
    if (lista) lista.push(it);
    else porCotizacion.set(it.cotizacion_id, [it]);
  }

  return cabeceras.map((c) => aCotizacion(c, porCotizacion.get(c.id) ?? []));
}

/** Cotización completa, con los blobs de cada ítem. */
export async function obtener(id: number) {
  const fila = (await CotizadorCotizacion.findByPk(id, { raw: true })) as unknown as Fila | null;
  if (!fila) return null;
  const items = (await CotizadorCotizacionItem.findAll({
    where: { cotizacion_id: id },
    order: [['orden', 'ASC']],
    raw: true,
  })) as unknown as Fila[];
  return aCotizacion(fila, items);
}

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
    `UPDATE cotizador_consecutivo SET valor = valor + 1 WHERE nombre = 'cotizacion' RETURNING valor;`,
    { transaction: t, type: QueryTypes.SELECT }
  )) as unknown as Array<{ valor: number }>;
  if (!filas.length) {
    throw new Error('No existe el contador de cotizaciones (cotizador_consecutivo).');
  }
  return filas[0].valor;
}

export async function crear(datos: CotizacionEntrada) {
  const items = datos.items ?? [];
  const totales = calcularTotales(items);
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
        segmento_cliente: datos.segmentoCliente ?? 'PA',
        asesor: datos.asesor ?? '',
        descuento_pct: datos.descuentoPct ?? 0,
        total_subtotal: totales.subtotal,
        total_iva: totales.iva,
        total_total: totales.total,
      } as Fila,
      { transaction: t }
    )) as unknown as Fila;

    for (const [i, it] of items.entries()) {
      await CotizadorCotizacionItem.create(
        {
          cotizacion_id: cot.id,
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
 * Los ítems se reconcilian por `orden` (upsert), NUNCA borrando y recreando:
 * Sequelize omite el UPDATE cuando `changed()` está vacío, así que un ítem que
 * no se tocó no dispara el hook de auditoría y no genera una fila más. Con
 * delete+insert, guardar dos veces una cotización de 8 ítems escribiría 16
 * filas de auditoría con sus blobs, sin que nada hubiera cambiado.
 */
export async function actualizar(id: number, datos: CotizacionEntrada & { items?: ItemEntrada[] }) {
  const t = await sequelize.transaction();
  try {
    const cot = await CotizadorCotizacion.findByPk(id, { transaction: t });
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
    if (datos.segmentoCliente !== undefined) cambios.segmento_cliente = datos.segmentoCliente;
    if (datos.asesor !== undefined) cambios.asesor = datos.asesor;
    if (datos.descuentoPct !== undefined) cambios.descuento_pct = datos.descuentoPct;
    if (datos.estado !== undefined) cambios.estado = datos.estado;

    if (datos.items !== undefined) {
      const items = datos.items;
      const totales = calcularTotales(items);
      cambios.total_subtotal = totales.subtotal;
      cambios.total_iva = totales.iva;
      cambios.total_total = totales.total;

      const existentes = (await CotizadorCotizacionItem.findAll({
        where: { cotizacion_id: id },
        transaction: t,
      })) as unknown as Array<Fila & { update: (v: Fila, o: Fila) => Promise<unknown>; destroy: (o: Fila) => Promise<unknown> }>;
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
          await existente.update(valores, { transaction: t });
          porOrden.delete(i);
        } else {
          await CotizadorCotizacionItem.create(
            { cotizacion_id: id, orden: i, ...valores } as Fila,
            { transaction: t }
          );
        }
      }
      // Los que sobran (la cotización perdió ítems) sí se borran.
      for (const sobrante of porOrden.values()) {
        await sobrante.destroy({ transaction: t });
      }
    }

    cambios.version = ((cot as unknown as Fila).version ?? 1) + 1;
    await (cot as unknown as Fila).update(cambios, { transaction: t });

    await t.commit();
    return await obtener(id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

export async function eliminar(id: number): Promise<boolean> {
  const t = await sequelize.transaction();
  try {
    const cot = await CotizadorCotizacion.findByPk(id, { transaction: t });
    if (!cot) {
      await t.rollback();
      return false;
    }
    // Los ítems se borran de uno en uno y no con un `destroy({where})` masivo:
    // los hooks de auditoría son de instancia y una baja en bloque no los
    // dispara, así que el borrado pasaría sin dejar rastro.
    const items = (await CotizadorCotizacionItem.findAll({
      where: { cotizacion_id: id },
      transaction: t,
    })) as unknown as Array<{ destroy: (o: Fila) => Promise<unknown> }>;
    for (const it of items) await it.destroy({ transaction: t });
    await (cot as unknown as Fila).destroy({ transaction: t });
    await t.commit();
    return true;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}
