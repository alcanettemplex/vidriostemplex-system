// Diagnóstico y recarga manual de la caché del cotizador.
//
// Existe porque el módulo puede quedar indisponible sin que el ERP se entere:
// si la precarga falla al arrancar, el resto del sistema sigue funcionando con
// normalidad y sólo estas rutas responden 503. Sin un endpoint que lo diga, la
// única pista sería un mensaje en los logs del arranque.
import { Request, Response } from 'express';
import * as cache from '../cotizador/cache';

/** GET /estado — qué tiene cargado la caché y desde cuándo. Nunca falla:
 * responder "estoy caído y este es el motivo" es justo su trabajo. */
export const estadoCotizador = async (_req: Request, res: Response) => {
  res.json(cache.diagnostico());
};

/**
 * POST /recargar — reconstruye la caché desde Postgres.
 *
 * Sirve para dos cosas: recuperar el módulo sin redesplegar si la precarga
 * falló al arrancar (una caída puntual de la base, por ejemplo), y recoger un
 * cambio hecho directamente en la base sin pasar por la aplicación.
 */
export const recargarCotizador = async (_req: Request, res: Response) => {
  try {
    await cache.precargar();
    res.json({ mensaje: 'Caché del cotizador recargada.', ...cache.diagnostico() });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error('recargarCotizador:', detalle);
    cache.marcarIndisponible(detalle);
    res.status(503).json({
      error: `No se pudo recargar la caché del cotizador: ${detalle}`,
    });
  }
};

/**
 * Middleware de las rutas del módulo: si la caché no está lista, los motores
 * lanzarían al primer acceso y el usuario vería un 500 sin explicación. Esto lo
 * convierte en un 503 con un motivo legible y una salida.
 */
export const requireCotizadorDisponible = (_req: Request, res: Response, next: () => void) => {
  if (cache.disponible()) return next();
  const { ultimoError } = cache.diagnostico();
  return res.status(503).json({
    error:
      'El módulo Cotizador no está disponible en este momento porque no se pudieron cargar sus datos. ' +
      'Puedes reintentar desde Sistema → Cotizador, o avisar a soporte si sigue igual.',
    detalle: ultimoError,
  });
};
