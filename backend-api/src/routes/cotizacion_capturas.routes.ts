import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadCotizacionConfig } from '../config/upload';
import {
  getCapturas,
  createCaptura,
  updateNota,
  deleteCaptura,
} from '../controllers/cotizacion_captura.controller';

const router = Router();

// Todos los autenticados pueden ver
router.get('/', authMiddleware, getCapturas);

// Solo asesor_comercial, jefe_produccion y admin pueden subir
router.post(
  '/',
  authMiddleware,
  requireRole('asesor_comercial', 'jefe_produccion', 'admin', 'gerencia'),
  uploadCotizacionConfig.single('imagen'),
  createCaptura,
);

// Editar nota y eliminar: la lógica de creador/admin está en el controller
router.patch('/:id', authMiddleware, updateNota);
router.delete('/:id', authMiddleware, deleteCaptura);

export default router;
