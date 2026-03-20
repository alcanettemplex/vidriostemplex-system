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

// Dashboard gerencial: solo admin y gerencia (y contabilidad para el general)
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), getDashboardData);

// Nuevos endpoints avanzados para el Dashboard de Gerente
router.get('/general', authMiddleware, requireRole('admin', 'gerencia'), getGeneralData);
router.get('/ventas', authMiddleware, requireRole('admin', 'gerencia'), getVentasData);
router.get('/produccion', authMiddleware, requireRole('admin', 'gerencia'), getProduccionData);
router.get('/equipo', authMiddleware, requireRole('admin', 'gerencia'), getEquipoData);
router.get('/alertas', authMiddleware, requireRole('admin', 'gerencia'), getAlertas);

export default router;
