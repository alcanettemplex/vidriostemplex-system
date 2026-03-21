import { Router } from 'express';
import { obtenerConfiguracion, actualizarConfiguracion, obtenerMetasMes, actualizarMetasMes } from '../controllers/configuracion.controller';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// Accesible para gerente, admin para VER y EDITAR
router.get('/', authMiddleware, requireRole(['admin', 'gerencia']), obtenerConfiguracion);
router.put('/', authMiddleware, requireRole(['admin', 'gerencia']), actualizarConfiguracion);

router.get('/metas/:anio/:mes', authMiddleware, requireRole(['admin', 'gerencia']), obtenerMetasMes);
router.put('/metas/:anio/:mes', authMiddleware, requireRole(['admin', 'gerencia']), actualizarMetasMes);

export default router;
