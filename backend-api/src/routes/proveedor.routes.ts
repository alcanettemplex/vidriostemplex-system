import { Router } from 'express';
import multer from 'multer';
import { NextFunction, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  listarProveedores,
  crearProveedor,
  editarProveedor,
  desactivarProveedor,
  cambiarSeguimiento,
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
  contarPendientes,
  vincularPendiente,
  descartarPendiente,
  descartarLote,
  listarEquivalencias,
  desvincularEquivalencia,
  historicoEquivalencia,
  listarFacturasProcesadas,
  importarListaPrecios,
  buscarEnModulo,
} from '../controllers/proveedor.controller';

const router = Router();

// Todas las rutas del módulo de proveedores requieren autenticación
// y solo son accesibles para root y admin (precios de compra = info sensible).
router.use(authMiddleware);
router.use(requireRole('root', 'admin'));

/**
 * Traduce los errores de multer a mensajes que expliquen qué corregir.
 * Sin esto, superar el tamaño o la cantidad de archivos devolvía un error genérico
 * que en pantalla se leía como "error al procesar el lote".
 */
const manejarErroresCarga = (subir: any) => (req: Request, res: Response, next: NextFunction) => {
  subir(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Hay un archivo que supera los 8 MB permitidos por factura. Sepáralo y vuelve a intentarlo.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Puedes cargar hasta 100 archivos por lote. Divide la carga en tandas más pequeñas.' });
      }
      return res.status(400).json({ error: `No se pudo recibir el archivo (${err.code}).` });
    }
    return res.status(400).json({ error: err.message || 'No se pudo recibir el archivo.' });
  });
};

// ─── Maestro de proveedores ───────────────────────────────────────────────────
router.get('/', listarProveedores);
router.post('/', crearProveedor);

// ─── Buscador transversal del módulo (barra única + autocompletado) ──────────
router.get('/buscar', buscarEnModulo);

// ─── Consulta comparativa de precios (la pantalla principal) ──────────────────
// Dos alias históricos del mismo endpoint; ambos en uso desde el frontend.
router.get('/precios', consultarPrecios);
router.get('/consulta', consultarPrecios);

// ─── Importación desde Excel de World Office ──────────────────────────────────
router.post('/importar-excel', manejarErroresCarga(uploadExcel), importarExcel);

// ─── Ingesta de Facturas Electrónicas (.zip y .xml) ───────────────────────────
router.post('/facturas/cargar', manejarErroresCarga(uploadFacturas), cargarFacturasLote);

// ─── Bitácora: qué documentos ya entraron por la ingesta ─────────────────────
router.get('/facturas', listarFacturasProcesadas);

// ─── Bandeja de códigos sin mapear ───────────────────────────────────────────
router.get('/codigos-pendientes', listarPendientes);
router.get('/codigos-pendientes/count', contarPendientes);
router.post('/codigos-pendientes/descartar-lote', descartarLote);
router.post('/codigos-pendientes/:id/vincular', vincularPendiente);
router.patch('/codigos-pendientes/:id/descartar', descartarPendiente);

// ─── Equivalencias (mapeos confirmados) ──────────────────────────────────────
router.get('/equivalencias', listarEquivalencias);
router.get('/equivalencias/:id/historico', historicoEquivalencia);
router.delete('/equivalencias/:id', desvincularEquivalencia);

// ─── Editar / desactivar un mapeo puntual ────────────────────────────────────
router.patch('/productos/:pp_id', editarPrecio);
router.delete('/productos/:pp_id', desactivarMapeo);

// ─── Rutas con parámetro al final: no deben capturar las literales de arriba ──
router.get('/:id/productos', listarProductosProveedor);
router.post('/:id/productos', agregarPrecioManual);
// Lista de precios en Excel (Fase 3). Sin `dry_run: false` explícito solo previsualiza.
router.post('/:id/importar-precios', manejarErroresCarga(uploadExcel), importarListaPrecios);
router.patch('/:id/seguimiento', cambiarSeguimiento);
router.patch('/:id', editarProveedor);
router.delete('/:id', desactivarProveedor);

export default router;
