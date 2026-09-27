// Pestaña "Cotizaciones" del Dashboard gerencial (rediseño 2026-09-27).
// La lógica y las consultas viven en `services/dashboardCotizaciones.service.ts`.
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  datosPanel,
  filtrosSchema,
  generarExcel,
  puedeVerPanelCotizaciones,
  resolverFiltros,
} from '../services/dashboardCotizaciones.service';

/** Solo control total del Cotizador y asesores comerciales. */
export function exigirAccesoPanelCotizaciones(req: Request, res: Response, next: NextFunction) {
  if (puedeVerPanelCotizaciones(req.user?.rol)) return next();
  return res.status(403).json({
    error: 'Tu rol no tiene acceso al tablero de cotizaciones. Si lo necesitas, pídelo a administración.',
  });
}

function responderError(res: Response, contexto: string, e: unknown, mensaje: string) {
  if (e instanceof ZodError) {
    const primero = e.issues[0];
    const campo = primero?.path?.join('.') || '';
    const texto = primero?.code === 'unrecognized_keys'
      ? 'La pantalla envió un filtro que el tablero no reconoce. Recarga la página e inténtalo de nuevo.'
      : primero?.message ?? 'Revisa los filtros.';
    return res.status(400).json({ error: campo ? `Filtro "${campo}": ${texto}` : texto });
  }
  console.error(`${contexto}:`, e instanceof Error ? e.message : e);
  return res.status(500).json({ error: mensaje });
}

function usuarioDe(req: Request) {
  return { id: Number(req.user!.id), rol: String(req.user!.rol) };
}

export const getPanelCotizaciones = async (req: Request, res: Response) => {
  try {
    const filtros = resolverFiltros(filtrosSchema.parse(req.query), usuarioDe(req));
    res.json(await datosPanel(filtros));
  } catch (e) {
    responderError(res, 'getPanelCotizaciones', e, 'No se pudo cargar el tablero de cotizaciones. Intenta de nuevo en un momento.');
  }
};

export const descargarExcelCotizaciones = async (req: Request, res: Response) => {
  try {
    const usuario = usuarioDe(req);
    const filtros = resolverFiltros(filtrosSchema.parse(req.query), usuario);
    const buffer = await generarExcel(filtros, usuario);
    const nombre = `Cotizaciones ${filtros.desde} a ${filtros.hasta}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  } catch (e) {
    responderError(res, 'descargarExcelCotizaciones', e, 'No se pudo generar el Excel de cotizaciones. Intenta de nuevo en un momento.');
  }
};
