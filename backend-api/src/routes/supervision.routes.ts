import { Router } from 'express';
import {
  getSupervisionResumen,
  getSupervisionAltoValor,
  getSupervisionSeguimiento,
} from '../controllers/crm.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Módulo exclusivo del rol admin — centro de control de supervisión comercial.
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/resumen', getSupervisionResumen);
router.get('/alto-valor', getSupervisionAltoValor);
router.get('/seguimiento', getSupervisionSeguimiento);

export default router;
