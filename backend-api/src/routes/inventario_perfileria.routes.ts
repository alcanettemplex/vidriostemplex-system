import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  getInventario,
  getInventarioStats,
  exportInventario,
  updateInventarioItem,
  deleteInventarioItem,
  bulkInsertPerfileria,
} from '../controllers/inventario_perfileria.controller';

const router = Router();

router.use(authMiddleware);

// VER: compras, produccion (incl. jefe y auxiliar), admin, gerencia, marketing.
// jefe_produccion y auxiliar_produccion se agregaron el 2026-07-27: AppRoutes.tsx ya
// les daba acceso a /inventario, así que cargaban la página y recibían 403.
const LECTURA_INVENTARIO = [
  'admin', 'gerencia', 'compras', 'produccion',
  'jefe_produccion', 'auxiliar_produccion', 'marketing',
] as const;

router.get('/', requireRole(...LECTURA_INVENTARIO), getInventario);
router.get('/stats', requireRole(...LECTURA_INVENTARIO), getInventarioStats);
router.get('/export', requireRole(...LECTURA_INVENTARIO), exportInventario);

// CRUD: compras, admin, gerencia
router.post('/bulk', requireRole('admin', 'gerencia', 'compras'), bulkInsertPerfileria);
router.patch('/:id', requireRole('admin', 'gerencia', 'compras'), updateInventarioItem);
router.delete('/:id', requireRole('admin', 'gerencia', 'compras'), deleteInventarioItem);

export default router;
