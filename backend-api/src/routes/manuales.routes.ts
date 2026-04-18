import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { servirManual } from '../controllers/manuales.controller';

const router = Router();

router.get('/usuario', authMiddleware, servirManual('usuario'));
router.get('/tecnico', authMiddleware, servirManual('tecnico'));

export default router;
