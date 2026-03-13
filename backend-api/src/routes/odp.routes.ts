import { Router } from 'express';
import { getODPs, getODP, createODP, updateODP, deleteODP, finalizarInstalacionODP } from '../controllers/odp.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getODPs);
router.get('/:id', authMiddleware, getODP);

// Creación: asesores, admin, gerencia
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial'), createODP);

// Actualización: asesores, producción, admin, gerencia, jefe_produccion
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion', 'auxiliar_produccion'), updateODP);

// Eliminación: solo admin y gerencia
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia'), deleteODP);

// Finalizar instalación: instaladores, admin, producción
router.post('/:id/instalacion', authMiddleware, requireRole('admin', 'jefe_produccion', 'instalador'), uploadConfig.single('foto'), finalizarInstalacionODP);

export default router;
