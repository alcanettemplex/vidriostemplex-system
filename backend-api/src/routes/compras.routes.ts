import { Router } from 'express';
import {
  getODPsConSAPPendiente,
  getODCsSeguimiento,
  getODCsRecibidas,
  getSAPParaCompras,
  createODC,
  updateODC,
  deleteODC,
  toggleExistencia,
} from '../controllers/odc.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole, RolUsuario } from '../middlewares/rbacMiddleware';

const router = Router();

const rc = (...r: RolUsuario[]) => requireRole(...r);

router.get('/panel', authMiddleware, rc('admin', 'gerencia', 'compras'), getODPsConSAPPendiente);
router.get('/seguimiento', authMiddleware, rc('admin', 'gerencia', 'compras'), getODCsSeguimiento);
router.get('/recibidas', authMiddleware, rc('admin', 'gerencia', 'compras'), getODCsRecibidas);
router.get('/sap/:sap_id', authMiddleware, rc('admin', 'gerencia', 'compras'), getSAPParaCompras);
router.post('/odc', authMiddleware, rc('admin', 'gerencia', 'compras'), createODC);
router.put('/odc/:id', authMiddleware, rc('admin', 'gerencia', 'compras'), updateODC);
router.delete('/odc/:id', authMiddleware, rc('admin', 'gerencia', 'compras'), deleteODC);
router.patch('/sap-item/:id/existencia', authMiddleware, rc('admin', 'gerencia', 'compras'), toggleExistencia);

export default router;
