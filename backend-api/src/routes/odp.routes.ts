import { Router } from 'express';
import { getODPs, getODP, createODP, updateODP, deleteODP, finalizarInstalacionODP } from '../controllers/odp.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

router.get('/', authMiddleware, getODPs);
router.get('/:id', authMiddleware, getODP);
router.post('/', authMiddleware, createODP);
router.put('/:id', authMiddleware, updateODP);
router.delete('/:id', authMiddleware, deleteODP);
router.post('/:id/instalacion', authMiddleware, uploadConfig.single('foto'), finalizarInstalacionODP);

export default router;
