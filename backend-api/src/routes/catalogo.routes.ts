import { Router } from 'express';
import { getCatalogo, getCatalogoAll, createCatalogo, updateCatalogo, deleteCatalogo } from '../controllers/catalogo.controller';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// Todos los autenticados pueden leer el catálogo activo (para el formulario ODP)
router.get('/', authMiddleware, getCatalogo);

// Solo admin/gerencia pueden gestionar el catálogo completo
router.get('/all', authMiddleware, requireRole(['admin', 'gerencia']), getCatalogoAll);
router.post('/', authMiddleware, requireRole(['admin', 'gerencia']), createCatalogo);
router.put('/:id', authMiddleware, requireRole(['admin', 'gerencia']), updateCatalogo);
router.delete('/:id', authMiddleware, requireRole(['admin', 'gerencia']), deleteCatalogo);

export default router;
