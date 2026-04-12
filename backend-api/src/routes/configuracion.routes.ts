import { Router } from 'express';
import {
  obtenerConfiguracion,
  actualizarConfiguracion,
  obtenerMetasMes,
  actualizarMetasMes,
  obtenerMetasUsuariosMes,
  actualizarMetasUsuariosMes,
} from '../controllers/configuracion.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Accesible para gerente, admin para VER y EDITAR
router.get('/', authMiddleware, requireRole('admin', 'gerencia'), obtenerConfiguracion);
router.put('/', authMiddleware, requireRole('admin', 'gerencia'), actualizarConfiguracion);

router.get('/metas/:anio/:mes', authMiddleware, requireRole('admin', 'gerencia'), obtenerMetasMes);
router.put('/metas/:anio/:mes', authMiddleware, requireRole('admin', 'gerencia'), actualizarMetasMes);

router.get('/metas-usuarios/:anio/:mes', authMiddleware, requireRole('admin', 'gerencia'), obtenerMetasUsuariosMes);
router.put('/metas-usuarios/:anio/:mes', authMiddleware, requireRole('admin', 'gerencia'), actualizarMetasUsuariosMes);

export default router;
