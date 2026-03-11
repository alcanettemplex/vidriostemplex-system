import { Router } from 'express';
import { getSAPsByODP, createSAP, updateSAP } from '../controllers/sap.controller';
import { getCotizacionesByODP, createCotizacion, updateCotizacion } from '../controllers/cotizacion.controller';
import { getTMsByODP, createTM, updateTM } from '../controllers/toma_medidas.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

// SAP routes — Solo asesores y admin pueden crear
router.get('/sap/odp/:odp_id', authMiddleware, getSAPsByODP);
router.post('/sap', authMiddleware, createSAP);
router.put('/sap/:id', authMiddleware, updateSAP);

// Cotizacion routes
router.get('/cotizacion/odp/:odp_id', authMiddleware, getCotizacionesByODP);
router.post('/cotizacion', authMiddleware, createCotizacion);
router.put('/cotizacion/:id', authMiddleware, updateCotizacion);

// TM routes — Solo jefe_produccion y admin
router.get('/tm/odp/:odp_id', authMiddleware, getTMsByODP);
router.post('/tm', authMiddleware, createTM);
router.put('/tm/:id', authMiddleware, updateTM);

export default router;
