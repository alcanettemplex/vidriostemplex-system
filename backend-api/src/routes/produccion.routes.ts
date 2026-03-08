import { Router } from 'express';
import { getProduccion, createProduccion, updateProduccion, deleteProduccion } from '../controllers/produccion.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getProduccion);
router.post('/', authMiddleware, createProduccion);
router.put('/:id', authMiddleware, updateProduccion);
router.delete('/:id', authMiddleware, deleteProduccion);

export default router;
