import { Router } from 'express';
import { getODPs, getODP, createODP, updateODP, deleteODP, finalizarInstalacionODP, uploadCroquisODP, revisarDano, getGarantias, crearGarantia, facturarODP, actualizarEstadoCaja, aprobarSinItems, agregarItems, getCargaPorMes, getCargaPorFecha } from '../controllers/odp.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getODPs);

// Carga por fecha — deben ir ANTES de /:id para no ser capturados por ese patrón
router.get('/carga-por-fecha', authMiddleware, getCargaPorMes);
router.get('/carga-por-fecha/:fecha', authMiddleware, getCargaPorFecha);

router.get('/:id', authMiddleware, getODP);

// Creación: asesores, admin, gerencia, jefe_produccion
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createODP);

// Actualización: asesores, admin, gerencia, jefe_produccion, produccion
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion'), updateODP);

// Eliminación: solo el creador (owner check en controller) + admin + gerencia
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), deleteODP);

// Finalizar instalación: instaladores, admin, gerencia, producción
router.post('/:id/instalacion', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'instalador'), uploadConfig.single('foto'), finalizarInstalacionODP);

// Subida de croquis: asesores, admin, gerencia, jefe_produccion
router.post('/:id/croquis', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), uploadConfig.single('croquis'), uploadCroquisODP);

// Marcar daño de instalación como revisado: asesor dueño, admin, gerencia (owner check en controller)
router.patch('/:id/revisar-dano', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial'), revisarDano);

// Facturación: contabilidad, admin, gerencia pueden registrar/actualizar FE
router.patch('/:id/facturar', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), facturarODP);

// Estado de caja: contabilidad, admin, gerencia pueden cambiar estado_caja manualmente
router.patch('/:id/caja', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), actualizarEstadoCaja);

// Aprobar ODP sin requerimientos (pago adelantado): asesor creador, admin, gerencia
router.patch('/:id/aprobar-sin-items', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), aprobarSinItems);

// Agregar ítems a ODP existente (desde módulo PedidosPV — puede_gestionar_pv)
router.post('/:id/items', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion', 'compras'), agregarItems);

// Garantías: listado global y creación desde una ODP padre
router.get('/garantias/all', authMiddleware, getGarantias);
router.post('/:id/garantia', authMiddleware, requireRole('admin', 'asesor_comercial', 'gerencia', 'jefe_produccion'), crearGarantia);

export default router;

