import { Router } from 'express';
import { getProduccion, createProduccion, updateProduccion, deleteProduccion } from '../controllers/produccion.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Lectura: roles operativos
router.get('/', authMiddleware, getProduccion);

// Escritura: producción, jefe_produccion, admin
router.post('/', authMiddleware, requireRole('admin', 'jefe_produccion', 'produccion'), createProduccion);
router.put('/:id', authMiddleware, requireRole('admin', 'jefe_produccion', 'produccion'), updateProduccion);
router.delete('/:id', authMiddleware, requireRole('admin', 'jefe_produccion'), deleteProduccion);

export default router;
