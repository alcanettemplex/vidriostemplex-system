import { Router } from 'express';
import { getClientes, getCliente, createCliente, updateCliente, deleteCliente } from '../controllers/cliente.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Lectura: gerencia, jefe_produccion, asesor_comercial, contabilidad
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), getClientes);
router.get('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), getCliente);

// Creación: gerencia, jefe_produccion, asesor_comercial, contabilidad (+ admin)
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), createCliente);

// Edición: solo el creador (owner check en controller) + autenticado con rol permitido
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), updateCliente);

// Eliminación: solo el creador (owner check en controller) + autenticado con rol permitido
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), deleteCliente);

export default router;
