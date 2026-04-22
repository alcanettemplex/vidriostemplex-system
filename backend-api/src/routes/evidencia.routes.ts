import { Router } from 'express';
import { getEvidencias, getEvidencia, createEvidencia, updateEvidencia, deleteEvidencia } from '../controllers/evidencia.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

// Lectura: todos los autenticados
router.get('/', authMiddleware, getEvidencias);
router.get('/:id', authMiddleware, getEvidencia);

// Subida de evidencia: instaladores, producción, admin, gerencia
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'instalador'), uploadConfig.single('foto'), createEvidencia);
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'instalador'), updateEvidencia);
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia'), deleteEvidencia);

export default router;
