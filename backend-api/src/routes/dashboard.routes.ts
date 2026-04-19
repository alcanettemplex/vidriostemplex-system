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

const DASHBOARD_ROLES = ['admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root', 'asesor_comercial', 'produccion', 'compras', 'asistente_administrativo', 'marketing'] as const;

router.get('/', authMiddleware, requireRole(...DASHBOARD_ROLES), getDashboardData);
router.get('/general', authMiddleware, requireRole(...DASHBOARD_ROLES), getGeneralData);
router.get('/ventas', authMiddleware, requireRole(...DASHBOARD_ROLES), getVentasData);
router.get('/produccion', authMiddleware, requireRole(...DASHBOARD_ROLES), getProduccionData);
router.get('/equipo', authMiddleware, requireRole(...DASHBOARD_ROLES), getEquipoData);
router.get('/alertas', authMiddleware, requireRole(...DASHBOARD_ROLES), getAlertas);

export default router;
