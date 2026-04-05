import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  getInventario,
  getInventarioStats,
  updateInventarioItem,
  deleteInventarioItem,
  bulkInsertPerfileria,
} from '../controllers/inventario_perfileria.controller';

const router = Router();

router.use(authMiddleware);

// VER: compras, produccion
router.get('/', requireRole('admin', 'compras', 'produccion'), getInventario);
router.get('/stats', requireRole('admin', 'compras', 'produccion'), getInventarioStats);

// CRUD: solo compras (+ admin)
router.post('/bulk', requireRole('admin', 'compras'), bulkInsertPerfileria);
router.patch('/:id', requireRole('admin', 'compras'), updateInventarioItem);
router.delete('/:id', requireRole('admin', 'compras'), deleteInventarioItem);

export default router;
