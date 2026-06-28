import { Router } from 'express';
import {
  getODPsConSAPPendiente,
  getODCsSeguimiento,
  getODCsRecibidas,
  getODCItems,
  getSAPParaCompras,
  createODC,
  updateODC,
  sincronizarItemODC,
  recibirItems,
  toggleExistencia,
  updateExistPerf,
  dividirPorExistencia,
  getInventarioPorCodigo,
  deleteInventarioPerfileria,
  getCodigosPerfileria,
  getVidriosPorGestionar,
  getVidriosPanel,
  getVidriosExistencia,
  createODCVidrios,
  updateEstadoItemVidrio,
  createODCSinSAP,
  asignarExistencia,
  revertirExistencia,
  getPerfileriaExistencia,
  eliminarODC,
  editarItemsODC,
} from '../controllers/odc.controller';

import authMiddleware from '../middlewares/authMiddleware';
import { requireRole, RolUsuario } from '../middlewares/rbacMiddleware';

const router = Router();

const rc = (...r: RolUsuario[]) => requireRole(...r);

// VER: todos autenticados
router.get('/panel', authMiddleware, getODPsConSAPPendiente);
router.get('/seguimiento', authMiddleware, getODCsSeguimiento);
router.get('/recibidas', authMiddleware, getODCsRecibidas);
router.get('/odc/:id/items', authMiddleware, getODCItems);
router.get('/sap/:sap_id', authMiddleware, getSAPParaCompras);
router.get('/codigos-perfileria', authMiddleware, getCodigosPerfileria);
router.get('/perfileria/existencia', authMiddleware, getPerfileriaExistencia);
router.get('/inventario-perfileria/:codigo', authMiddleware, getInventarioPorCodigo);

// CRUD: solo admin + compras
router.post('/odc', authMiddleware, rc('admin', 'compras'), createODC);
router.post('/odc-sin-sap', authMiddleware, rc('admin', 'compras'), createODCSinSAP);
// Específica antes que '/odc/:id' para que matchee primero
router.put('/odc/:id/items', authMiddleware, rc('admin', 'compras'), editarItemsODC);
router.put('/odc/:id', authMiddleware, rc('admin', 'compras'), updateODC);
router.put('/odc/:id/recibir-items', authMiddleware, rc('admin', 'compras', 'jefe_produccion', 'produccion'), recibirItems);
router.delete('/odc/:id', authMiddleware, rc('admin', 'compras'), eliminarODC);
router.patch('/odc/:id/sincronizar-item/:itemId', authMiddleware, rc('admin', 'compras'), sincronizarItemODC);
router.patch('/sap-item/:id/existencia', authMiddleware, rc('admin', 'compras'), toggleExistencia);
router.patch('/sap-item/:id/exist-perf', authMiddleware, rc('admin', 'compras'), updateExistPerf);
router.post('/sap-item/:id/dividir-existencia', authMiddleware, rc('admin', 'compras'), dividirPorExistencia);
router.post('/sap-item/:id/asignar-existencia', authMiddleware, rc('admin', 'compras'), asignarExistencia);
router.post('/sap-item/:id/revertir-existencia', authMiddleware, rc('admin', 'compras'), revertirExistencia);
router.delete('/inventario-perfileria/:consecutivo', authMiddleware, rc('admin', 'compras'), deleteInventarioPerfileria);

// Vidrios - VER: todos + jefe_produccion; CRUD: solo compras
router.get('/vidrios/panel', authMiddleware, getVidriosPanel);         // lista plana por tipo_vidrio (pendientes)
router.get('/vidrios/existencia', authMiddleware, getVidriosExistencia); // items en_existencia (no ENTREGADA)
router.get('/vidrios', authMiddleware, getVidriosPorGestionar);         // backward compat (vista por ODP)
router.post('/vidrios/odc', authMiddleware, rc('admin', 'compras'), createODCVidrios);
router.patch('/vidrios/item/:id/estado', authMiddleware, rc('admin', 'compras'), updateEstadoItemVidrio);


export default router;
