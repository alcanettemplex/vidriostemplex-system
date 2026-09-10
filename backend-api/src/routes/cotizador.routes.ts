import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  estadoCotizador,
  recargarCotizador,
  requireCotizadorDisponible,
} from '../controllers/cotizador_estado.controller';
import {
  getDisenos,
  getCatalogo,
  getParametrosGlobales,
  getModulos,
} from '../controllers/cotizador_catalogo.controller';
import { cotizarItem } from '../controllers/cotizador_cotizar.controller';
import { previsualizarPlano, planoDeItem } from '../controllers/cotizador_plano.controller';
import {
  listarCotizaciones,
  obtenerCotizacion,
  aptitudCotizacion,
  crearCotizacion,
  actualizarCotizacion,
  eliminarCotizacion,
} from '../controllers/cotizador_cotizaciones.controller';
import {
  listarPrecios,
  historialPrecios,
  obtenerPrecio,
  editarPrecio,
  crearPrecio,
  darDeBajaPrecio,
  editarParametros,
} from '../controllers/cotizador_precios.controller';
import { obtenerEmpresa, actualizarEmpresa } from '../controllers/cotizador_empresa.controller';

const router = Router();

// Módulo aislado del flujo del ERP, visible solo para root/admin (ver plan de
// migración): mismos precios/costos que Proveedores, mismo criterio de acceso.
router.use(authMiddleware);
router.use(requireRole('root', 'admin'));

// Estado y recarga van ANTES del gate de disponibilidad: son las únicas rutas
// que deben poder responder aunque la caché del cotizador esté caída.
router.get('/estado', estadoCotizador);
router.post('/recargar', recargarCotizador);

router.use(requireCotizadorDisponible);

router.get('/disenos', getDisenos);
router.get('/catalogo', getCatalogo);
router.get('/parametros', getParametrosGlobales);
router.put('/parametros', editarParametros);
router.get('/modulos', getModulos);

router.post('/cotizar/:moduloId', cotizarItem);

router.get('/plano', previsualizarPlano);

router.get('/empresa', obtenerEmpresa);
router.put('/empresa', actualizarEmpresa);

// Literales antes de ':codigo' — si no, "historial" se leería como un código.
router.get('/precios/historial', historialPrecios);
router.get('/precios/:codigo', obtenerPrecio);
router.put('/precios/:codigo', editarPrecio);
router.delete('/precios/:codigo', darDeBajaPrecio);
router.get('/precios', listarPrecios);
router.post('/precios', crearPrecio);

// Literales antes de ':id' — mismo motivo.
router.get('/cotizaciones/:id/aptitud', aptitudCotizacion);
router.get('/cotizaciones/:id/items/:itemId/plano', planoDeItem);
router.get('/cotizaciones/:id', obtenerCotizacion);
router.put('/cotizaciones/:id', actualizarCotizacion);
router.delete('/cotizaciones/:id', eliminarCotizacion);
router.get('/cotizaciones', listarCotizaciones);
router.post('/cotizaciones', crearCotizacion);

export default router;
