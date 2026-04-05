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

// Dashboard gerencial: solo admin, gerencia y jefe_produccion
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getDashboardData);

// Nuevos endpoints avanzados para el Dashboard de Gerente
router.get('/general', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getGeneralData);
router.get('/ventas', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getVentasData);
router.get('/produccion', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getProduccionData);
router.get('/equipo', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getEquipoData);
router.get('/alertas', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion'), getAlertas);

export default router;
