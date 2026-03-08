import { Router } from 'express';
import { getClientes, getCliente, createCliente, updateCliente, deleteCliente } from '../controllers/cliente.controller';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getClientes);
router.get('/:id', authMiddleware, getCliente);
router.post('/', authMiddleware, createCliente);
router.put('/:id', authMiddleware, updateCliente);
router.delete('/:id', authMiddleware, deleteCliente);

export default router;
