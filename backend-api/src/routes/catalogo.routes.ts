import { Router } from 'express';
import { getCatalogo, getCatalogoAll, createCatalogo, updateCatalogo, deleteCatalogo } from '../controllers/catalogo.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Todos los autenticados pueden leer el catálogo activo (para el formulario ODP)
router.get('/', authMiddleware, getCatalogo);

// Solo admin/gerencia pueden gestionar el catálogo completo
router.get('/all', authMiddleware, requireRole('root', 'admin', 'gerencia'), getCatalogoAll);
router.post('/', authMiddleware, requireRole('root', 'admin', 'gerencia'), createCatalogo);
router.put('/:id', authMiddleware, requireRole('root', 'admin', 'gerencia'), updateCatalogo);
router.delete('/:id', authMiddleware, requireRole('root', 'admin', 'gerencia'), deleteCatalogo);

export default router;
