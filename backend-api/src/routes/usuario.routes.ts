import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, setupAdmin } from '../controllers/usuario.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Setup admin inicial (sin auth, solo funciona si no existe ningún admin)
router.post('/setup', setupAdmin);

// Listar usuarios: admin, gerencia y asistente pueden ver la lista (necesario para asignar leads en CRM)
router.get('/', authMiddleware, requireRole('admin', 'gerencia', 'asistente_administrativo', 'root', 'asesor_comercial'), getUsuarios);

// CRUD completo: solo admin
router.post('/', authMiddleware, requireRole('admin'), createUsuario);
router.put('/:id', authMiddleware, requireRole('admin'), updateUsuario);
router.delete('/:id', authMiddleware, requireRole('admin'), deleteUsuario);

export default router;
