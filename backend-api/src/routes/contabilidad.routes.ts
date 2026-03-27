import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { getResumenFinanciero, getPagos, getPagosPorODP, registrarPago } from '../controllers/contabilidad.controller';

const router = Router();

// Acceso: admin, gerencia, contabilidad
router.get('/resumen', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), getResumenFinanciero);
router.get('/pagos', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), getPagos);
router.get('/pagos/:odp_id', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), getPagosPorODP);
router.post('/pagos', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), registrarPago);

export default router;
