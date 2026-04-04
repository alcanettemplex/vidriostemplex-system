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
  updateExistPerf,
  getInventarioPorCodigo,
  deleteInventarioPerfileria,
  getCodigosPerfileria,
  getVidriosPorGestionar,
  createODCVidrios,
  updateEstadoItemVidrio,
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
router.patch('/sap-item/:id/exist-perf', authMiddleware, rc('admin', 'gerencia', 'compras'), updateExistPerf);
router.get('/codigos-perfileria', authMiddleware, rc('admin', 'gerencia', 'compras'), getCodigosPerfileria);
router.get('/inventario-perfileria/:codigo', authMiddleware, rc('admin', 'gerencia', 'compras'), getInventarioPorCodigo);
router.delete('/inventario-perfileria/:consecutivo', authMiddleware, rc('admin', 'gerencia', 'compras'), deleteInventarioPerfileria);

// Vidrios
router.get('/vidrios', authMiddleware, rc('admin', 'gerencia', 'compras', 'jefe_produccion'), getVidriosPorGestionar);
router.post('/vidrios/odc', authMiddleware, rc('admin', 'gerencia', 'compras'), createODCVidrios);
router.patch('/vidrios/item/:id/estado', authMiddleware, rc('admin', 'gerencia', 'compras'), updateEstadoItemVidrio);

export default router;
