import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Seguridad: Lanzar error si no hay secret configurado en lugar de usar un fallback débil
if (!JWT_SECRET) {
  throw new Error('FATAL: La variable de entorno JWT_SECRET no está configurada. El servidor no puede iniciar sin ella.');
}

declare global {
  namespace Express {
    interface Request {
      user?: jwt.JwtPayload;
    }
  }
}

/**
 * Middleware de autenticación JWT.
 * Extrae y valida el token del header Authorization.
 * Inyecta el payload decodificado (id, rol) en req.user.
 */
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    // Seguridad: Verificar que el payload contenga los campos mínimos
    if (!decoded.id || !decoded.rol) {
      return res.status(401).json({ error: 'Token con estructura inválida' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expirado, inicia sesión de nuevo' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default authMiddleware;
