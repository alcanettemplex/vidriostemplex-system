import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Tipos de rol válidos en el sistema Templex.
 * Cada ruta puede requerir uno o más roles para acceder.
 */
export type RolUsuario =
  | 'root'
  | 'admin'
  | 'gerencia'
  | 'jefe_produccion'
  | 'asesor_comercial'
  | 'produccion'
  | 'instalador'
  | 'conductor'
  | 'contabilidad'
  | 'compras'
  | 'asistente_administrativo';

/**
 * Middleware de control de acceso basado en roles (RBAC).
 * Se usa DESPUÉS de authMiddleware para verificar que el usuario
 * autenticado tenga uno de los roles permitidos.
 *
 * @param rolesPermitidos - Lista de roles que pueden acceder a la ruta
 *
 * Ejemplo de uso:
 *   router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia'), deleteODP);
 */
export const requireRole = (...rolesPermitidos: RolUsuario[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as jwt.JwtPayload | undefined;

    if (!user || !user.rol) {
      console.warn('RBAC: No se detectó JWT o rol en req.user');
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No se pudo determinar el rol del usuario.',
      });
    }

    const rolBuffer = (user.rol as string).toLowerCase();

    // root tiene acceso a todo sin restricciones
    if (rolBuffer === 'root') return next();

    const permitidosBuffer = rolesPermitidos.map(r => r.toLowerCase());

    if (!permitidosBuffer.includes(rolBuffer)) {
      console.warn(`RBAC: Rol '${user.rol}' no está en lista permitida:`, rolesPermitidos);
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`,
      });
    }

    next();
  };
};
