import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Tipos de rol válidos en el sistema Templex.
 * Cada ruta puede requerir uno o más roles para acceder.
 */
export type RolUsuario =
  | 'admin'
  | 'gerencia'
  | 'jefe_produccion'
  | 'asesor_comercial'
  | 'produccion'
  | 'auxiliar_produccion'
  | 'instalador'
  | 'contabilidad'
  | 'compras';

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
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No se pudo determinar el rol del usuario.',
      });
    }

    if (!rolesPermitidos.includes(user.rol as RolUsuario)) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: `Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`,
      });
    }

    next();
  };
};
