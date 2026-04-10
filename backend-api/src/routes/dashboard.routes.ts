import { Router } from 'express';
import {
  getDashboardData,
  getGeneralData,
  getVentasData,
  getProduccionData,
  getEquipoData,
  getAlertas
} from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Dashboard gerencial: admin, gerencia, jefe_produccion, contabilidad y root
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getDashboardData);

// Endpoints avanzados del Dashboard Gerencial
router.get('/general', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getGeneralData);
router.get('/ventas', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getVentasData);
router.get('/produccion', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getProduccionData);
router.get('/equipo', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getEquipoData);
router.get('/alertas', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root'), getAlertas);

export default router;
