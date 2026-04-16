import { Router } from 'express';
import { getODPs, getODP, createODP, updateODP, deleteODP, finalizarInstalacionODP, uploadCroquisODP, revisarDano, getGarantias, crearGarantia, facturarODP, actualizarEstadoCaja } from '../controllers/odp.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getODPs);
router.get('/:id', authMiddleware, getODP);

// Creación: asesores, admin, jefe_produccion
router.post('/', authMiddleware, requireRole('admin', 'asesor_comercial', 'jefe_produccion'), createODP);

// Actualización: asesores y admin para datos generales; produccion y jefe_produccion para checkboxes de taller
router.put('/:id', authMiddleware, requireRole('admin', 'asesor_comercial', 'jefe_produccion', 'produccion'), updateODP);

// Eliminación: solo el creador (owner check en controller) + admin
router.delete('/:id', authMiddleware, requireRole('admin', 'asesor_comercial', 'jefe_produccion'), deleteODP);

// Finalizar instalación: instaladores, admin, producción
router.post('/:id/instalacion', authMiddleware, requireRole('admin', 'jefe_produccion', 'instalador'), uploadConfig.single('foto'), finalizarInstalacionODP);

// Subida de croquis: asesores, admin, gerencia, jefe_produccion
router.post('/:id/croquis', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), uploadConfig.single('croquis'), uploadCroquisODP);

// Marcar daño de instalación como revisado: asesor dueño, admin, gerencia (owner check en controller)
router.patch('/:id/revisar-dano', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial'), revisarDano);

// Facturación: contabilidad, admin, gerencia pueden registrar/actualizar FE
router.patch('/:id/facturar', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), facturarODP);

// Estado de caja: contabilidad, admin, gerencia pueden cambiar estado_caja manualmente
router.patch('/:id/caja', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), actualizarEstadoCaja);

// Garantías: listado global y creación desde una ODP padre
router.get('/garantias/all', authMiddleware, getGarantias);
router.post('/:id/garantia', authMiddleware, requireRole('admin', 'asesor_comercial', 'gerencia', 'jefe_produccion'), crearGarantia);

export default router;

