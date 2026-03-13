import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Dashboard gerencial: solo admin, gerencia y contabilidad
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), getDashboardData);

export default router;
