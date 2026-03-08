import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getDashboardData);

export default router;
