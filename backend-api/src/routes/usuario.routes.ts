import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, setupAdmin } from '../controllers/usuario.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.post('/setup', setupAdmin);

router.get('/', authMiddleware, getUsuarios);
router.post('/', authMiddleware, createUsuario);
router.put('/:id', authMiddleware, updateUsuario);
router.delete('/:id', authMiddleware, deleteUsuario);

export default router;
