import { Router } from 'express';
import { 
  createNoConformidad, 
  getNoConformidadesByODP, 
  updateNoConformidad 
} from '../controllers/no_conformidad.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

router.post('/', authMiddleware, createNoConformidad);
router.get('/odp/:odpId', authMiddleware, getNoConformidadesByODP);
router.patch('/:id', authMiddleware, requireRole('admin', 'gerencia'), updateNoConformidad);

export default router;
