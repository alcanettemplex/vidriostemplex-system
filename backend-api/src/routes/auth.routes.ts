import { Router } from 'express';
import { login, me, logout } from '../controllers/auth.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Seguridad: Rate limiting estricto en login para prevenir fuerza bruta
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

export default router;
