import { Router } from 'express';
import { getClientes, getCliente, createCliente, updateCliente, deleteCliente } from '../controllers/cliente.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getClientes);
router.get('/:id', authMiddleware, getCliente);

// Creación/edición: asesores, admin, gerencia, contabilidad
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'contabilidad'), createCliente);
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'contabilidad'), updateCliente);

// Eliminación: solo admin
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia'), deleteCliente);

export default router;
