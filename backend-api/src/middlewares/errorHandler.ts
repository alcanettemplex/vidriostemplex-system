import { Request, Response, NextFunction } from 'express';

/**
 * Clase de error personalizada para el sistema Templex.
 * Permite lanzar errores con código HTTP desde cualquier controlador.
 *
 * Ejemplo:
 *   throw new AppError('ODP no encontrada', 404);
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware centralizado de manejo de errores.
 * Captura todos los errores lanzados en controladores y los devuelve
 * con formato uniforme. Oculta detalles internos en producción.
 */
export const errorHandler = (err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? (err as AppError).statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log completo en servidor
  console.error(`[ERROR ${statusCode}]`, err.message);
  if (!isProduction) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: isAppError ? err.message : 'Error interno del servidor',
    ...((!isProduction && !isAppError) && { detalle: err.message }),
    ...((!isProduction) && { stack: err.stack }),
  });
};

/**
 * Wrapper para controladores async.
 * Captura errores de promesas rechazadas y los pasa al errorHandler
 * sin necesidad de try-catch en cada controlador.
 *
 * Ejemplo:
 *   router.get('/', authMiddleware, asyncHandler(getODPs));
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
