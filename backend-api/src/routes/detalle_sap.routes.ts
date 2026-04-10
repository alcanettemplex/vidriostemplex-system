import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadDetalleSAPConfig } from '../config/upload';
import { getImagenes, createImagen, deleteImagen } from '../controllers/detalle_sap.controller';

const router = Router();

// Todos los autenticados pueden ver
router.get('/', authMiddleware, getImagenes);

// Mismos roles que crean ODP pueden subir
router.post(
  '/',
  authMiddleware,
  requireRole('asesor_comercial', 'jefe_produccion', 'admin', 'gerencia', 'contabilidad'),
  uploadDetalleSAPConfig.single('imagen'),
  createImagen,
);

// Eliminar: lógica creador/admin en controller
router.delete('/:id', authMiddleware, deleteImagen);

export default router;
