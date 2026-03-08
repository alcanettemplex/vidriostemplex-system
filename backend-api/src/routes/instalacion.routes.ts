import { Router } from 'express';
import { getInstalaciones, getInstalacion, createInstalacion, updateInstalacion, deleteInstalacion } from '../controllers/instalacion.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getInstalaciones);
router.get('/:id', authMiddleware, getInstalacion);
router.post('/', authMiddleware, createInstalacion);
router.put('/:id', authMiddleware, updateInstalacion);
router.delete('/:id', authMiddleware, deleteInstalacion);

export default router;
