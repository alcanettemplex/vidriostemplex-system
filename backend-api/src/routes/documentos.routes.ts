import { Router } from 'express';
import { getSAPsByODP, createSAP, updateSAP, deleteSAP, buscarCatalogo } from '../controllers/sap.controller';
import { getCotizacionesByODP, createCotizacion, updateCotizacion } from '../controllers/cotizacion.controller';
import { getTMsByODP, getTMPanel, createTM, updateTM, uploadFotoTM } from '../controllers/toma_medidas.controller';
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
router.post('/cotizacion', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial'), createCotizacion);
router.put('/cotizacion/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial'), updateCotizacion);

// TM routes — Solo jefe_produccion y admin
router.get('/tm/panel', authMiddleware, requireRole('admin', 'jefe_produccion'), getTMPanel);
router.get('/tm/odp/:odp_id', authMiddleware, getTMsByODP);
router.post('/tm', authMiddleware, requireRole('admin', 'jefe_produccion'), createTM);
router.put('/tm/:id', authMiddleware, requireRole('admin', 'jefe_produccion'), updateTM);
router.post('/tm/:id/foto', authMiddleware, requireRole('admin', 'jefe_produccion'), uploadConfig.single('foto'), uploadFotoTM);

export default router;
