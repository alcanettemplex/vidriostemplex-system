import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

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

// Roles de solo lectura: pueden consultar cualquier módulo al que tengan acceso,
// pero no crear, editar ni eliminar nada. El bloqueo vive aquí —y no en cada ruta—
// porque varias rutas de escritura no declaran `requireRole` (quedaron abiertas a
// cualquier autenticado): un control por método HTTP las cubre todas, incluidas las
// que se agreguen en el futuro, sin alterar los permisos de ningún otro rol.
const ROLES_SOLO_LECTURA = new Set(['marketing']);
const METODOS_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

// Etiqueta legible del módulo a partir del path, para el mensaje de error.
const MODULO_POR_PREFIJO: Record<string, string> = {
  odp: 'las Órdenes de Producción',
  contabilidad: 'Contabilidad',
  crm: 'el CRM',
  prospectos: 'los Prospectos',
  clientes: 'los Clientes',
  produccion: 'Producción',
  instalaciones: 'las Instalaciones',
  rutas: 'las Rutas de instalación',
  compras: 'Compras',
  'inventario-perfileria': 'el Inventario de Perfilería',
  'pedidos-pv': 'los Pedidos PV',
  'facturas-salidas': 'Facturas vs Salidas',
  documentos: 'los documentos de la ODP',
  'notas-produccion': 'las notas de producción',
  'no-conformidad': 'las No Conformidades',
  evidencias: 'las evidencias',
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.id || !decoded.rol) {
      return res.status(401).json({ error: 'Token con estructura inválida' });
    }
    req.user = decoded;

    if (ROLES_SOLO_LECTURA.has(String(decoded.rol)) && !METODOS_LECTURA.has(req.method)) {
      // `req.path` aquí es relativo al router donde se montó el middleware, así que se
      // usa `originalUrl` (p. ej. "/api/prospectos/12") para identificar el módulo.
      const prefijo = req.originalUrl.replace(/^\/api\//, '').split(/[/?]/)[0];
      const modulo = MODULO_POR_PREFIJO[prefijo] || 'este módulo';
      return res.status(403).json({
        error: `Tu rol es de solo lectura: puedes consultar ${modulo}, pero no crear, modificar ni eliminar registros. Si necesitas hacer un cambio, solicítalo al área responsable.`,
      });
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expirado, inicia sesión de nuevo' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default authMiddleware;
