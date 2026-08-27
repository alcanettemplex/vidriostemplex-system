import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  listarProveedores,
  crearProveedor,
  editarProveedor,
  desactivarProveedor,
  importarExcel,
  uploadExcel,
  uploadFacturas,
  cargarFacturasLote,
  consultarPrecios,
  listarProductosProveedor,
  agregarPrecioManual,
  editarPrecio,
  desactivarMapeo,
  listarPendientes,
  vincularPendiente,
  descartarPendiente,
  listarEquivalencias,
  desvincularEquivalencia,
} from '../controllers/proveedor.controller';

const router = Router();

// Todas las rutas del módulo de proveedores requieren autenticación
// y solo son accesibles para root y admin (precios de compra = info sensible).
router.use(authMiddleware);
router.use(requireRole('root', 'admin'));

// ─── Maestro de proveedores ───────────────────────────────────────────────────
router.get('/', listarProveedores);
router.post('/', crearProveedor);
router.patch('/:id', editarProveedor);
router.delete('/:id', desactivarProveedor);

// ─── Importación desde Excel de World Office ──────────────────────────────────
router.post('/importar-excel', uploadExcel, importarExcel);

// ─── Ingesta de Facturas Electrónicas (.zip y .xml) ───────────────────────────
router.post('/facturas/cargar', uploadFacturas, cargarFacturasLote);

// ─── Consulta comparativa de precios (la pantalla principal) ──────────────────
router.get('/precios', consultarPrecios);
router.get('/consulta', consultarPrecios);

// ─── Bandeja de códigos sin mapear ───────────────────────────────────────────
router.get('/codigos-pendientes', listarPendientes);
router.get('/pendientes', listarPendientes);
router.post('/codigos-pendientes/:id/vincular', vincularPendiente);
router.post('/pendientes/:id/vincular', vincularPendiente);
router.patch('/codigos-pendientes/:id/descartar', descartarPendiente);
router.post('/pendientes/:id/descartar', descartarPendiente);

// ─── Equivalencias (mapeos confirmados) ──────────────────────────────────────
router.get('/equivalencias', listarEquivalencias);
router.delete('/equivalencias/:id', desvincularEquivalencia);

// ─── Productos por proveedor ──────────────────────────────────────────────────
router.get('/:id/productos', listarProductosProveedor);
router.post('/:id/productos', agregarPrecioManual);

// ─── Editar / desactivar un mapeo puntual ────────────────────────────────────
router.patch('/productos/:pp_id', editarPrecio);
router.delete('/productos/:pp_id', desactivarMapeo);

export default router;

