import { Router } from 'express';
import { getEvidencias, getEvidencia, createEvidencia, updateEvidencia, deleteEvidencia } from '../controllers/evidencia.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { uploadConfig } from '../config/upload';

const router = Router();

router.get('/', authMiddleware, getEvidencias);
router.get('/:id', authMiddleware, getEvidencia);
router.post('/', authMiddleware, uploadConfig.single('foto'), createEvidencia);
router.put('/:id', authMiddleware, updateEvidencia);
router.delete('/:id', authMiddleware, deleteEvidencia);

export default router;
