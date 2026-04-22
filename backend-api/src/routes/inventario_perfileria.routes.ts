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

// VER: compras, produccion, admin, gerencia
router.get('/', requireRole('admin', 'gerencia', 'compras', 'produccion'), getInventario);
router.get('/stats', requireRole('admin', 'gerencia', 'compras', 'produccion'), getInventarioStats);

// CRUD: compras, admin, gerencia
router.post('/bulk', requireRole('admin', 'gerencia', 'compras'), bulkInsertPerfileria);
router.patch('/:id', requireRole('admin', 'gerencia', 'compras'), updateInventarioItem);
router.delete('/:id', requireRole('admin', 'gerencia', 'compras'), deleteInventarioItem);

export default router;
