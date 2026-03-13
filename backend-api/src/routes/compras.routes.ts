import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { getCompras, getCompra, createCompra, updateCompra, deleteCompra } from '../controllers/compras.controller';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getCompras);
router.get('/:id', authMiddleware, getCompra);

// Escritura: admin, jefe_produccion, asesor_comercial
router.post('/', authMiddleware, requireRole('admin', 'jefe_produccion', 'asesor_comercial'), createCompra);
router.put('/:id', authMiddleware, requireRole('admin', 'jefe_produccion', 'asesor_comercial'), updateCompra);

// Eliminación: solo admin y jefe_produccion
router.delete('/:id', authMiddleware, requireRole('admin', 'jefe_produccion'), deleteCompra);

export default router;
