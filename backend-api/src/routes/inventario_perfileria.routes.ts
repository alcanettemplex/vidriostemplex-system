import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  getInventario,
  getInventarioStats,
  updateInventarioItem,
  deleteInventarioItem,
  bulkInsertPerfileria,
} from '../controllers/inventario_perfileria.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getInventario);
router.get('/stats', getInventarioStats);
router.post('/bulk', bulkInsertPerfileria);
router.patch('/:id', updateInventarioItem);
router.delete('/:id', deleteInventarioItem);

export default router;
