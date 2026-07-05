import { Router } from 'express';
import {
  getSupervisionResumen,
  getSupervisionAltoValor,
  getSupervisionSeguimiento,
  getSupervisionPrimerContacto,
  generarLineamiento,
  getLineamiento,
  marcarItemLineamiento,
  actualizarNotasLineamiento,
  getAdherenciaLineamiento,
} from '../controllers/crm.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Módulo exclusivo del rol admin — centro de control de supervisión comercial.
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/resumen', getSupervisionResumen);
router.get('/alto-valor', getSupervisionAltoValor);
router.get('/seguimiento', getSupervisionSeguimiento);
router.get('/primer-contacto', getSupervisionPrimerContacto);

router.get('/lineamiento/adherencia', getAdherenciaLineamiento);
router.get('/lineamiento', getLineamiento);
router.post('/lineamiento', generarLineamiento);
router.patch('/lineamiento/item/:id', marcarItemLineamiento);
router.patch('/lineamiento/:id/notas', actualizarNotasLineamiento);

export default router;
