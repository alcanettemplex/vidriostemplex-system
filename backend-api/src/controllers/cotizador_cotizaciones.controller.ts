// CRUD de cotizaciones guardadas, más la evaluación de aptitud para orden de
// corte.
import { Request, Response } from 'express';
import { z } from 'zod';
import * as store from '../cotizador/store/cotizacionStore';
import { evaluarAptitudOrden } from '../cotizador/lib/aptitudOrden';

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

const crearSchema = z
  .object({
    cliente: clienteSchema.optional(),
    segmentoCliente: z.enum(['PA', 'PM', 'PB']).optional(),
    asesor: z.string().max(80).optional(),
    descuentoPct: z.number().min(0).max(1).optional(),
    estado: z.enum(['PENDIENTE', 'APROBADA', 'CANCELADO', 'PERDIDO']).optional(),
    items: z.array(itemSchema).optional(),
  })
  .strict();

function idValido(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function responderZod(res: Response, e: unknown): boolean {
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: e.issues[0]?.message ?? 'Datos inválidos.' });
    return true;
  }
  return false;
}

/**
 * GET /cotizaciones — listado con filtros combinables (AND).
 *
 * Devuelve los ítems SIN sus dos JSONB (`input` y `resultado`): con 50
 * cotizaciones de varios ítems serían cientos de KB por pantallazo. Para eso
 * están las columnas espejo. El detalle completo se pide con `GET /:id`.
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

export const obtenerCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const cot = await store.obtener(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(cot);
  } catch (e) {
    console.error('obtenerCotizacion:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer la cotización.' });
  }
};

/**
 * GET /cotizaciones/:id/aptitud — si esta cotización, y cada uno de sus ítems,
 * se puede imprimir como ORDEN DE CORTE definitiva para el taller.
 *
 * La regla vive entera en `lib/aptitudOrden` (8 condiciones documentadas ahí);
 * este endpoint sólo carga la cotización guardada y se la pasa. El cliente
 * nunca decide esto por su cuenta: pinta lo que llega de aquí.
 */
export const aptitudCotizacion = async (req: Request, res: Response) => {
  const id = idValido(req.params.id);
  if (id === null) return res.status(400).json({ error: 'El identificador de cotización no es válido.' });
  try {
    const cot = await store.obtener(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
    res.json(evaluarAptitudOrden(cot));
  } catch (e) {
    console.error('aptitudCotizacion:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo evaluar la aptitud de la cotización.' });
  }
};

export const crearCotizacion = async (req: Request, res: Response) => {
  try {
    const datos = crearSchema.parse(req.body ?? {});
    const nueva = await store.crear(datos);
    res.status(201).json(nueva);
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('crearCotizacion:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo guardar la cotización.' });
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
    if (responderZod(res, e)) return;
    console.error('actualizarCotizacion:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo actualizar la cotización.' });
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
    console.error('eliminarCotizacion:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo eliminar la cotización.' });
  }
};
