import { Router } from 'express';
import { getProspectos, getProspecto, createProspecto, updateProspecto, noAprobarProspecto, aprobarProspecto } from '../controllers/prospecto.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

const rc = (...r: any[]) => requireRole(...r);

router.get('/', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), getProspectos);
router.get('/:id', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), getProspecto);
router.post('/', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createProspecto);
router.put('/:id', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), updateProspecto);
router.patch('/:id/no-aprobar', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), noAprobarProspecto);
router.post('/:id/aprobar', authMiddleware, rc('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), aprobarProspecto);

export default router;
