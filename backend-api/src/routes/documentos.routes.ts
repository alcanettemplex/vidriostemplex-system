import { Router } from 'express';
import { getSAPsByODP, createSAP, updateSAP, deleteSAP, buscarCatalogo } from '../controllers/sap.controller';
import { getCotizacionesByODP, createCotizacion, updateCotizacion } from '../controllers/cotizacion.controller';
import { getTMsByODP, getTMPanel, createTM, programarTM, updateTM, deleteTM, uploadFotoTM, retornarTM, getTMsSinODP, vincularTMaODP } from '../controllers/toma_medidas.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

// SAP routes
router.get('/sap/odp/:odp_id', authMiddleware, getSAPsByODP);
router.post('/sap', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createSAP);
router.put('/sap/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), updateSAP);
router.delete('/sap/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), deleteSAP);
router.get('/sap/catalogo/buscar', authMiddleware, buscarCatalogo);

// Cotización routes — Asesores y admin
router.get('/cotizacion/odp/:odp_id', authMiddleware, getCotizacionesByODP);
router.post('/cotizacion', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createCotizacion);
router.put('/cotizacion/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), updateCotizacion);

// TM routes
router.get('/tm/panel', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo'), getTMPanel);
router.get('/tm/sin-odp', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial'), getTMsSinODP);
router.get('/tm/odp/:odp_id', authMiddleware, getTMsByODP);
router.post('/tm', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial'), createTM);
router.patch('/tm/:id/programar', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), programarTM);
router.patch('/tm/:id/retornar', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), retornarTM);
router.patch('/tm/:id/vincular-odp', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial'), vincularTMaODP);
router.put('/tm/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'produccion'), updateTM);
router.delete('/tm/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'produccion'), deleteTM);
router.post('/tm/:id/foto', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), uploadConfig.single('foto'), uploadFotoTM);

export default router;
