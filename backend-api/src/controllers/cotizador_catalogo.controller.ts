// Lecturas del catálogo del cotizador: diseños disponibles, productos con
// precio, parámetros globales y la lista de módulos de producto.
//
// Todo sale de la caché en memoria, así que estos cuatro endpoints no tocan la
// base de datos y no suman egress.
import { Request, Response } from 'express';
import { listarCatalogo, getParametros } from '../cotizador/lib/catalogo';
import { listarModulos } from '../cotizador/modules/registry';
import { listarDisenos } from '../cotizador/lib/motorDespiece';

/**
 * Diseños con despiece real disponibles para un módulo (OX, XOX, OXXO...).
 * Por defecto sólo los que tienen todos sus perfiles con precio en el catálogo;
 * con `?todos=1` se incluyen también los que aún no se pueden costear.
 */
export const getDisenos = async (req: Request, res: Response) => {
  try {
    const modulo = typeof req.query.modulo === 'string' ? req.query.modulo : undefined;
    res.json(listarDisenos({ modulo, soloCotizables: req.query.todos !== '1' }));
  } catch (e) {
    console.error('getDisenos:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el catálogo de diseños.' });
  }
};

export const getCatalogo = async (req: Request, res: Response) => {
  try {
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria : undefined;
    res.json(listarCatalogo({ categoria }));
  } catch (e) {
    console.error('getCatalogo:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el catálogo de productos.' });
  }
};

export const getParametrosGlobales = async (_req: Request, res: Response) => {
  try {
    res.json(getParametros());
  } catch (e) {
    console.error('getParametrosGlobales:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron leer los parámetros del cotizador.' });
  }
};

export const getModulos = async (_req: Request, res: Response) => {
  res.json(listarModulos());
};
