import { Router } from 'express';
import {
  getCotizaciones,
  getCotizacion,
  createCotizacion,
  updateCotizacion,
  cambiarEstado,
  convertirAODP,
  deleteCotizacion,
  getCotizacionesByODP,
} from '../controllers/cotizacion.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const ROLES_COMERCIAL = ['root', 'admin', 'gerencia', 'jefe_produccion', 'asesor_comercial'] as const;
const ROLES_ADMIN = ['root', 'admin', 'gerencia'] as const;

const router = Router();

// Lectura
router.get('/', authMiddleware, requireRole(...ROLES_COMERCIAL), getCotizaciones);
router.get('/odp/:odp_id', authMiddleware, requireRole(...ROLES_COMERCIAL), getCotizacionesByODP);
router.get('/:id', authMiddleware, requireRole(...ROLES_COMERCIAL), getCotizacion);

// Creación y edición
router.post('/', authMiddleware, requireRole(...ROLES_COMERCIAL), createCotizacion);
router.put('/:id', authMiddleware, requireRole(...ROLES_COMERCIAL), updateCotizacion);

// Cambio de estado
router.patch('/:id/estado', authMiddleware, requireRole(...ROLES_COMERCIAL), cambiarEstado);

// Convertir a ODP
router.post('/:id/convertir', authMiddleware, requireRole(...ROLES_ADMIN, 'asesor_comercial'), convertirAODP);

// Eliminación
router.delete('/:id', authMiddleware, requireRole(...ROLES_ADMIN), deleteCotizacion);

export default router;
