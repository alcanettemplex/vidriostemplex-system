import { Router } from 'express';
import { getProspectos, getProspecto, createProspecto, updateProspecto, noAprobarProspecto, aprobarProspecto } from '../controllers/prospecto.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

const rc = (...r: any[]) => requireRole(...r);

// VER: todos autenticados
router.get('/', authMiddleware, getProspectos);
router.get('/:id', authMiddleware, getProspecto);

// CREAR: todos autenticados (cualquiera puede crear)
router.post('/', authMiddleware, createProspecto);

// EDITAR/ELIMINAR: solo el creador (owner check en controller) + autenticado
router.put('/:id', authMiddleware, updateProspecto);
router.patch('/:id/no-aprobar', authMiddleware, noAprobarProspecto);
router.post('/:id/aprobar', authMiddleware, aprobarProspecto);

export default router;
