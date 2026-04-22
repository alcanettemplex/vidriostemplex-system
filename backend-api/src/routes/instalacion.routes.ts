import { Router } from 'express';
import { getInstalaciones, getInstalacion, createInstalacion, updateInstalacion, deleteInstalacion } from '../controllers/instalacion.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getInstalaciones);
router.get('/:id', authMiddleware, getInstalacion);

// Escritura: jefe_produccion, admin, gerencia
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), createInstalacion);
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), updateInstalacion);
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), deleteInstalacion);

export default router;
