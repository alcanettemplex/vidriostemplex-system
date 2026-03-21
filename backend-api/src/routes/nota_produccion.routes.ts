import { Router } from 'express';
import { getNotasByODP, createNota } from '../controllers/nota_produccion.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.get('/:odpId', authMiddleware, getNotasByODP);
router.post('/', authMiddleware, createNota);

export default router;
