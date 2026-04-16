import { Router } from 'express';
import {
  getODPsConSAPPendiente,
  getODCsSeguimiento,
  getODCsRecibidas,
  getSAPParaCompras,
  createODC,
  updateODC,
  deleteODC,
  recibirItems,
  toggleExistencia,
  updateExistPerf,
  getInventarioPorCodigo,
  deleteInventarioPerfileria,
  getCodigosPerfileria,
  getVidriosPorGestionar,
  getVidriosPanel,
  getVidriosExistencia,
  createODCVidrios,
  updateEstadoItemVidrio,
} from '../controllers/odc.controller';

import authMiddleware from '../middlewares/authMiddleware';
import { requireRole, RolUsuario } from '../middlewares/rbacMiddleware';

const router = Router();

const rc = (...r: RolUsuario[]) => requireRole(...r);

// VER: todos autenticados
router.get('/panel', authMiddleware, getODPsConSAPPendiente);
router.get('/seguimiento', authMiddleware, getODCsSeguimiento);
router.get('/recibidas', authMiddleware, getODCsRecibidas);
router.get('/sap/:sap_id', authMiddleware, getSAPParaCompras);
router.get('/codigos-perfileria', authMiddleware, getCodigosPerfileria);
router.get('/inventario-perfileria/:codigo', authMiddleware, getInventarioPorCodigo);

// CRUD: solo admin + compras
router.post('/odc', authMiddleware, rc('admin', 'compras'), createODC);
router.put('/odc/:id', authMiddleware, rc('admin', 'compras'), updateODC);
router.put('/odc/:id/recibir-items', authMiddleware, rc('admin', 'compras', 'jefe_produccion', 'produccion'), recibirItems);
router.delete('/odc/:id', authMiddleware, rc('admin', 'compras'), deleteODC);
router.patch('/sap-item/:id/existencia', authMiddleware, rc('admin', 'compras'), toggleExistencia);
router.patch('/sap-item/:id/exist-perf', authMiddleware, rc('admin', 'compras'), updateExistPerf);
router.delete('/inventario-perfileria/:consecutivo', authMiddleware, rc('admin', 'compras'), deleteInventarioPerfileria);

// Vidrios - VER: todos + jefe_produccion; CRUD: solo compras
router.get('/vidrios/panel', authMiddleware, getVidriosPanel);         // lista plana por tipo_vidrio (pendientes)
router.get('/vidrios/existencia', authMiddleware, getVidriosExistencia); // items en_existencia (no ENTREGADA)
router.get('/vidrios', authMiddleware, getVidriosPorGestionar);         // backward compat (vista por ODP)
router.post('/vidrios/odc', authMiddleware, rc('admin', 'compras'), createODCVidrios);
router.patch('/vidrios/item/:id/estado', authMiddleware, rc('admin', 'compras'), updateEstadoItemVidrio);


export default router;
