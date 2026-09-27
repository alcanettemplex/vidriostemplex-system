import { Router } from 'express';
import { getClientes, getCliente, createCliente, updateCliente, deleteCliente } from '../controllers/cliente.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Lectura: gerencia, jefe_produccion, asesor_comercial, contabilidad, compras, asistente_administrativo
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad', 'compras', 'asistente_administrativo'), getClientes);
router.get('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad', 'compras', 'asistente_administrativo'), getCliente);

// Creación y edición: gerencia, jefe_produccion, asesor_comercial, contabilidad (+ admin)
// y asistente_administrativo (2026-09-27, decisión del usuario: crea cotizaciones,
// así que también debe poder dar de alta y corregir al cliente). Eliminar, no.
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad', 'asistente_administrativo'), createCliente);

// Edición: solo el creador (owner check en controller) + autenticado con rol permitido
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad', 'asistente_administrativo'), updateCliente);

// Eliminación: solo el creador (owner check en controller) + autenticado con rol permitido
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'contabilidad'), deleteCliente);

export default router;
