import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, setupAdmin } from '../controllers/usuario.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Setup admin inicial (sin auth, solo funciona si no existe ningún admin)
router.post('/setup', setupAdmin);

// CRUD usuarios: solo admin
router.get('/', authMiddleware, requireRole('admin', 'gerencia'), getUsuarios);
router.post('/', authMiddleware, requireRole('admin'), createUsuario);
router.put('/:id', authMiddleware, requireRole('admin'), updateUsuario);
router.delete('/:id', authMiddleware, requireRole('admin'), deleteUsuario);

export default router;
