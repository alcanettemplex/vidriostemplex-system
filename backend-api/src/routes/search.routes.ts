import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { globalSearch } from '../controllers/search.controller';

const router = Router();

router.get('/', authMiddleware, globalSearch);

export default router;
