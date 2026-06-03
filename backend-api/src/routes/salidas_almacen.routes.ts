import { Router } from 'express';
import {
  getFacturadas,
  getConSalida,
  getOAPendientes,
  getConSalidaOA,
  getNcSinSalida,
  createSalida,
  updateSalida,
  deleteSalida,
} from '../controllers/salidas_almacen.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole, RolUsuario } from '../middlewares/rbacMiddleware';

const router = Router();
const rc = (...r: RolUsuario[]) => requireRole(...r);

// Solo lectura: todos los roles con acceso al módulo
const PUEDE_VER  = rc('admin', 'gerencia', 'contabilidad', 'compras', 'produccion');
// Escritura: compras y produccion
const PUEDE_EDITAR = rc('admin', 'compras', 'produccion');

router.get('/facturadas',          authMiddleware, PUEDE_VER,    getFacturadas);
router.get('/con-salida',          authMiddleware, PUEDE_VER,    getConSalida);
router.get('/oa-pendientes',       authMiddleware, PUEDE_VER,    getOAPendientes);
router.get('/con-salida-oa',       authMiddleware, PUEDE_VER,    getConSalidaOA);
router.get('/nc',                  authMiddleware, PUEDE_VER,    getNcSinSalida);
router.post('/:odp_id/salida',     authMiddleware, PUEDE_EDITAR, createSalida);
router.put('/salida/:id',          authMiddleware, PUEDE_EDITAR, updateSalida);
router.delete('/salida/:id',       authMiddleware, PUEDE_EDITAR, deleteSalida);

export default router;
