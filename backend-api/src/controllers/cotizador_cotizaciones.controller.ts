// CRUD de cotizaciones guardadas, gestión de sus PROPUESTAS (A/B/C…) y de los
// cargos de obra de cada una, más la evaluación de aptitud para orden de corte.
//
// Los mensajes de error se escriben para el VENDEDOR, no para el desarrollador:
// nunca sale un error crudo de Sequelize ni de Zod. Las reglas de negocio viven
// en el store (`ErrorCotizador`, con su código HTTP y su texto ya redactado) y
// aquí sólo se traducen a respuesta.
import { Request, Response } from 'express';
import { z } from 'zod';
import * as store from '../cotizador/store/cotizacionStore';
import { ErrorCotizador } from '../cotizador/store/cotizacionStore';
import { evaluarAptitudOrden } from '../cotizador/lib/aptitudOrden';
import { sugerirSMO, tiposObra } from '../cotizador/lib/cargos';

const clienteSchema = z
  .object({
    nombre: z.string().max(150).optional(),
    direccion: z.string().max(200).nullable().optional(),
    telefono: z.string().max(50).nullable().optional(),
    obra: z.string().max(150).nullable().optional(),
    contacto: z.string().max(120).nullable().optional(),
  })
  .strict();

// `input` y `resultado` se aceptan como objeto libre: son el artefacto que
// produjo el motor y lo que se le cotizó al cliente. Validar su forma aquí
// sería declarar una estructura que el motor puede cambiar, y bloquearía
// reabrir una cotización guardada por una versión anterior.
const itemSchema = z
  .object({
    moduloId: z.string().max(30).optional(),
    descripcionItem: z.string().max(200).nullable().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
    resultado: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

const cargoSchema = z
  .object({
    tipo: z.enum(['SMO', 'ANDAMIO', 'HUACAL', 'FLETE', 'OTRO'], {
      message: 'El tipo de cargo debe ser mano de obra, andamio, huacal, flete u otro.',
    }),
    descripcion: z.string().max(200).nullable().optional(),
    cantidad: z
      .number({ message: 'La cantidad del cargo debe ser un número.' })
      .min(0, 'La cantidad de un cargo no puede ser negativa.')
      .max(10000, 'Esa cantidad es demasiado alta para un cargo de obra: revísala.')
      .optional(),
    unidad: z.enum(['DIA', 'UND', 'GLOBAL'], { message: 'La unidad del cargo debe ser día, unidad o global.' }).optional(),
    valorUnitario: z
      .number({ message: 'El valor del cargo debe ser un número.' })
      .min(0, 'El valor de un cargo no puede ser negativo.')
      .optional(),
    aplicaIva: z.boolean().optional(),
    origen: z.enum(['SUGERIDO', 'MANUAL']).optional(),
  })
  .strict();

/** El descuento es una FRACCIÓN (0,05 = 5%), no un porcentaje. El tope lo repite
 * `calcularTotalesPropuesta()` en el motor —no `totalizar()`, que solo gobierna
 * el descuento por ítem y ya no interviene aquí—, pero se corta antes en esta
 * capa con un mensaje que explica la confusión: un 5 escrito donde iba 0,05 se
 * aplicaría como 500% y dejaría el total en negativo. */
const descuentoSchema = z
  .number({ message: 'El descuento debe ser un número.' })
  .min(0, 'El descuento no puede ser negativo.')
  .max(1, 'El descuento se escribe como fracción: 0,05 para un 5%. Un valor mayor que 1 dejaría el total en negativo.');

const propuestaEntradaSchema = z
  .object({
    nombre: z.string().max(80).nullable().optional(),
    nota: z.string().max(2000).nullable().optional(),
    elegida: z.boolean().optional(),
    descuentoPct: descuentoSchema.optional(),
    items: z.array(itemSchema).optional(),
    cargos: z.array(cargoSchema).optional(),
  })
  .strict();

const crearSchema = z
  .object({
    cliente: clienteSchema.optional(),
    segmentoCliente: z.enum(['PA', 'PM', 'PB']).optional(),
    asesor: z.string().max(80).optional(),
    descuentoPct: descuentoSchema.optional(),
    estado: z.enum(['PENDIENTE', 'APROBADA', 'CANCELADO', 'PERDIDO']).optional(),
    // Contrato viejo (ítems planos) y contrato nuevo (propuestas) conviven: el
    // frontend migra en la Fase 3 y hasta entonces sigue mandando `items`.
    items: z.array(itemSchema).optional(),
    propuestas: z.array(propuestaEntradaSchema).optional(),
    propuestaId: z.number().int().positive().optional(),
  })
  .strict();

const crearPropuestaSchema = z
  .object({
    nombre: z.string().max(80).nullable().optional(),
    nota: z.string().max(2000).nullable().optional(),
    descuentoPct: descuentoSchema.optional(),
    desdePropuestaId: z.number().int().positive().optional(),
  })
  .strict();

const clonarSchema = z
  .object({
    nombre: z.string().max(80).nullable().optional(),
    nota: z.string().max(2000).nullable().optional(),
    codigoVidrio: z.string().max(30).optional(),
    pelicula: z.boolean().optional(),
    // El matizado admite `true` por compatibilidad: hasta 2026-09-12 era un
    // booleano y equivalía a la variante "total".
    matizado: z.union([z.boolean(), z.enum(['total', 'raya', 'dibujo'])]).optional(),
  })
  .strict();

const editarPropuestaSchema = z
  .object({
    nombre: z.string().max(80).nullable().optional(),
    nota: z.string().max(2000).nullable().optional(),
    descuentoPct: descuentoSchema.optional(),
  })
  .strict();

const cargosSchema = z
  .object({
    cargos: z.array(cargoSchema).max(20, 'Una propuesta no puede llevar más de 20 cargos de obra.'),
  })
  .strict();

function idValido(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function responderZod(res: Response, e: unknown): boolean {
  if (e instanceof z.ZodError) {
    const issue = e.issues[0];
    // El único mensaje que Zod redacta por su cuenta (y en inglés) es el de
    // `.strict()`: "Unrecognized key". No es un error del vendedor sino del
    // cliente que mandó un campo de más, así que se traduce a algo que al menos
    // se pueda leer y reportar.
    if (issue?.code === 'unrecognized_keys') {
      const claves = (issue as unknown as { keys?: string[] }).keys ?? [];
      return (
        res.status(400).json({
          error: `La aplicación envió un dato que este formulario no reconoce (${claves.join(', ')}). Recarga la página e inténtalo otra vez.`,
        }),
        true
      );
    }
    res.status(400).json({ error: issue?.message ?? 'Datos inválidos.' });
    return true;
  }
  return false;
}

/** Traduce un error de regla de negocio del store a su respuesta. Devuelve true
 * si ya respondió, para que el `catch` del handler siga con el 500 genérico en
 * cualquier otro caso. */
function responderNegocio(res: Response, e: unknown): boolean {
  if (e instanceof ErrorCotizador) {
    res.status(e.estado).json({ error: e.message });
    return true;
  }
  return false;
}

/** Los dos identificadores de la ruta `/cotizaciones/:id/propuestas/:pid`. */
function idsRuta(req: Request, res: Response): { id: number; pid: number } | null {
  const id = idValido(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'El identificador de cotización no es válido.' });
    return null;
  }
  const pid = idValido(req.params.pid);
  if (pid === null) {
    res.status(400).json({ error: 'El identificador de propuesta no es válido.' });
    return null;
  }
  return { id, pid };
}

function fallo(res: Response, contexto: string, e: unknown, mensaje: string) {
  if (responderZod(res, e)) return;
  if (responderNegocio(res, e)) return;
  console.error(`${contexto}:`, e instanceof Error ? e.message : e);
  res.status(500).json({ error: mensaje });
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

/**
 * GET /cotizaciones — listado con filtros combinables (AND).
 *
 * Devuelve los ítems SIN sus dos JSONB (`input` y `resultado`) y las propuestas
 * sin ítems ni cargos, sólo con sus totales espejo: con 50 cotizaciones de
 * varias propuestas serían cientos de KB por pantallazo. El detalle completo se
 * pide con `GET /:id`.
 */
export const listarCotizaciones = async (req: Request, res: Response) => {
  try {
    const { cliente, estado, asesor, numero, q } = req.query;
    const lista = await store.listar({
      cliente: typeof cliente === 'string' ? cliente : undefined,
      estado: typeof estado === 'string' ? estado : undefined,
      asesor: typeof asesor === 'string' ? asesor : undefined,
      numero: typeof numero === 'string' ? numero : undefined,
      q: typeof q === 'string' ? q : undefined,
    });
    res.json(lista);
  } catch (e) {
    console.error('listarCotizaciones:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo listar las cotizaciones.' });
  }
};

/**
 * GET /cotizaciones/:id — detalle.
 *
 * Trae los JSONB (`input`/`resultado`) de UNA sola propuesta: la que se pida con
 * `?propuesta=<id>` y, si no, la elegida. Las demás vienen con sus ítems en modo
 * ligero. Sin esta regla, cuatro propuestas multiplican por cuatro el peso del
 * detalle, que es la pantalla que más se abre del módulo.
 */
export const obtenerCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const propuesta = typeof req.query.propuesta === 'string' ? req.query.propuesta : undefined;
    const cot = await store.obtener(id, { propuesta });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(cot);
  } catch (e) {
    fallo(res, 'obtenerCotizacion', e, 'No se pudo leer la cotización.');
  }
};

/**
 * GET /cotizaciones/:id/aptitud — si esta cotización, y cada uno de los ítems de
 * su propuesta ELEGIDA, se puede imprimir como ORDEN DE CORTE definitiva para el
 * taller.
 *
 * La regla vive entera en `lib/aptitudOrden` (nueve condiciones documentadas
 * ahí); este endpoint sólo carga la cotización guardada y se la pasa. El cliente
 * nunca decide esto por su cuenta: pinta lo que llega de aquí.
 *
 * No se acepta `?propuesta`: la orden de corte sale de la elegida y de ninguna
 * otra. Evaluar una variante descartada daría un "sí, imprimible" sobre medidas
 * que nadie va a fabricar.
 */
export const aptitudCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const cot = await store.obtener(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(evaluarAptitudOrden(cot));
  } catch (e) {
    fallo(res, 'aptitudCotizacion', e, 'No se pudo evaluar la aptitud de la cotización.');
  }
};

export const crearCotizacion = async (req: Request, res: Response) => {
  try {
    const datos = crearSchema.parse(req.body ?? {});
    const nueva = await store.crear(datos);
    res.status(201).json(nueva);
  } catch (e) {
    fallo(res, 'crearCotizacion', e, 'No se pudo guardar la cotización.');
  }
};

export const actualizarCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const datos = crearSchema.parse(req.body ?? {});
    const actualizada = await store.actualizar(id, datos);
    if (!actualizada) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(actualizada);
  } catch (e) {
    fallo(res, 'actualizarCotizacion', e, 'No se pudo actualizar la cotización.');
  }
};

export const eliminarCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const ok = await store.eliminar(id);
    if (!ok) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.status(204).end();
  } catch (e) {
    fallo(res, 'eliminarCotizacion', e, 'No se pudo eliminar la cotización.');
  }
};

// ---------------------------------------------------------------------------
// Propuestas
// ---------------------------------------------------------------------------

/** POST /cotizaciones/:id/propuestas — propuesta nueva, vacía o copia exacta de
 * otra (`desdePropuestaId`). La etiqueta (A…E) la asigna el backend: si la
 * eligiera el cliente, dos pestañas abiertas crearían dos "B". */
export const crearPropuesta = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const datos = crearPropuestaSchema.parse(req.body ?? {});
    const r = await store.crearPropuesta(id, datos);
    res.status(201).json(r);
  } catch (e) {
    fallo(res, 'crearPropuesta', e, 'No se pudo crear la propuesta.');
  }
};

/**
 * POST /cotizaciones/:id/propuestas/:pid/clonar — la misma obra con otro vidrio.
 *
 * Recalcula cada ítem con el motor a partir de su `input` original más los
 * cambios pedidos. NO bloquea si algo sale con errores de precio (los dos
 * vidrios que hoy están a $0 en el catálogo, por ejemplo): crea la propuesta y
 * devuelve `advertencias` para que la pantalla las muestre. El vendedor no puede
 * arreglar el catálogo, así que bloquearlo ahí sería dejarlo sin salida.
 */
export const clonarPropuesta = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const { nombre, nota, ...cambios } = clonarSchema.parse(req.body ?? {});
    const r = await store.clonarPropuesta(ids.id, ids.pid, { cambios, nombre, nota });
    res.status(201).json(r);
  } catch (e) {
    fallo(res, 'clonarPropuesta', e, 'No se pudo duplicar la propuesta.');
  }
};

/** PATCH /cotizaciones/:id/propuestas/:pid — nombre, nota y descuento. */
export const actualizarPropuesta = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const datos = editarPropuestaSchema.parse(req.body ?? {});
    const r = await store.actualizarPropuesta(ids.id, ids.pid, datos);
    res.json(r);
  } catch (e) {
    fallo(res, 'actualizarPropuesta', e, 'No se pudo actualizar la propuesta.');
  }
};

/** PATCH /cotizaciones/:id/propuestas/:pid/elegir — la que se le cobra al
 * cliente y la que manda a corte. Con la cotización aprobada se rechaza: puede
 * haber salido material a corte con las medidas de la actual. */
export const elegirPropuesta = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const r = await store.elegirPropuesta(ids.id, ids.pid);
    res.json(r);
  } catch (e) {
    fallo(res, 'elegirPropuesta', e, 'No se pudo elegir la propuesta.');
  }
};

/** DELETE /cotizaciones/:id/propuestas/:pid — no se puede borrar la última, ni
 * la elegida de una cotización aprobada. */
export const eliminarPropuesta = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const r = await store.eliminarPropuesta(ids.id, ids.pid);
    res.json(r);
  } catch (e) {
    fallo(res, 'eliminarPropuesta', e, 'No se pudo borrar la propuesta.');
  }
};

/**
 * PUT /cotizaciones/:id/propuestas/:pid/cargos — reemplaza el juego COMPLETO.
 *
 * Es un PUT y no un PATCH por línea porque el panel de cargos es un formulario
 * que el vendedor edita entero y guarda de una vez; reconciliar línea por línea
 * obligaría al frontend a llevar ids de filas que para él son casillas.
 */
export const guardarCargosPropuesta = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const { cargos } = cargosSchema.parse(req.body ?? {});
    const r = await store.guardarCargos(ids.id, ids.pid, cargos);
    res.json(r);
  } catch (e) {
    fallo(res, 'guardarCargosPropuesta', e, 'No se pudieron guardar los cargos de obra.');
  }
};

/** GET /cotizaciones/:id/comparar — tabla lado a lado. La pantalla que se gira
 * hacia el cliente. */
export const compararPropuestas = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const r = await store.comparar(id);
    if (!r) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(r);
  } catch (e) {
    fallo(res, 'compararPropuestas', e, 'No se pudo armar la comparación de propuestas.');
  }
};

/**
 * GET /cotizaciones/:id/propuestas/:pid/smo-sugerido?tipoObra=armadaVentanas
 *
 * `{ monto, explicacion }` para el campo de mano de obra. El monto es una
 * SUGERENCIA: el vendedor puede cambiarlo, y al hacerlo el cargo pasa a
 * `origen: 'MANUAL'`. La explicación es el texto que la pantalla muestra debajo
 * del campo ("2,4 m² × $60.000") para que el vendedor sepa de dónde sale y pueda
 * defenderlo delante del cliente.
 *
 * Devuelve también `tiposObra` con las tarifas vigentes: son editables desde
 * Configuración y el selector no debe tenerlas cacheadas.
 */
/** Body de la sugerencia para una cotización que TODAVÍA NO EXISTE. Reutiliza
 * `itemSchema`: son los mismos ítems del carrito, tal cual los devolvió el
 * motor, sólo que aún no están guardados en ninguna parte. */
const smoBorradorSchema = z
  .object({
    items: z.array(itemSchema).max(100).optional(),
    tipoObra: z.string().max(30).optional(),
  })
  .strict();

/**
 * POST /smo-sugerido — la misma sugerencia, pero para un BORRADOR.
 *
 * El otro endpoint cuelga de `/cotizaciones/:id/propuestas/:pid`, y mientras el
 * vendedor arma la primera cotización esos dos ids no existen todavía: el panel
 * de cargos se quedaba sin sugerencia justo en la pantalla donde más se usa
 * (Cotizar). La alternativa era replicar la fórmula en el cliente, que rompería
 * el "un solo sitio donde se calcula el SMO" y perdería el piso del tablero
 * grande, que depende de `input.anchoCm`.
 *
 * Es POST y no GET porque los ítems del carrito viajan en el cuerpo: son los
 * blobs completos del motor y no caben en una query string. No escribe nada.
 */
export const smoSugeridoBorrador = async (req: Request, res: Response) => {
  try {
    const datos = smoBorradorSchema.parse(req.body ?? {});
    const items = (datos.items ?? []) as Parameters<typeof sugerirSMO>[0]['items'];
    res.json({ ...sugerirSMO({ items, tipoObra: datos.tipoObra }), tiposObra: tiposObra() });
  } catch (e) {
    if (responderZod(res, e)) return;
    fallo(res, 'smoSugeridoBorrador', e, 'No se pudo calcular la mano de obra sugerida.');
  }
};

export const smoSugerido = async (req: Request, res: Response) => {
  const ids = idsRuta(req, res);
  if (!ids) return;
  try {
    const items = await store.itemsDePropuesta(ids.id, ids.pid);
    if (items === null) return res.status(404).json({ error: 'Esa propuesta no existe en esta cotización.' });
    const tipoObra = typeof req.query.tipoObra === 'string' ? req.query.tipoObra : undefined;
    res.json({ ...sugerirSMO({ items, tipoObra }), tiposObra: tiposObra() });
  } catch (e) {
    fallo(res, 'smoSugerido', e, 'No se pudo calcular la mano de obra sugerida.');
  }
};
