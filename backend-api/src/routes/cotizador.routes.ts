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
import { previsualizarPlano, planoDeItem, despieceDeItem } from '../controllers/cotizador_plano.controller';
import {
  listarCotizaciones,
  obtenerCotizacion,
  aptitudCotizacion,
  crearCotizacion,
  actualizarCotizacion,
  eliminarCotizacion,
  crearPropuesta,
  clonarPropuesta,
  actualizarPropuesta,
  elegirPropuesta,
  eliminarPropuesta,
  guardarCargosPropuesta,
  compararPropuestas,
  smoSugerido,
  smoSugeridoBorrador,
  descargarPdfPropuesta,
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
import {
  listarEstadoSistemas,
  listarPiezasDeSistema,
  actualizarEstadoSistema,
  listarContrastes,
  registrarContraste,
  anularContraste,
  analizarPiezaEndpoint,
  aprobarMargen,
  anularMargen,
  listarHolguras,
  fijarHolgura,
  anularHolgura,
  listarHistorial,
} from '../controllers/cotizador_calibracion.controller';
import {
  listarMultiplicadores,
  guardarMultiplicador,
  recalcularCategoria,
} from '../controllers/cotizador_multiplicadores.controller';

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

// Mano de obra sugerida para una cotización que todavía no existe (el carrito
// viaja en el cuerpo). Fuera de `/cotizaciones/:id` a propósito: en un borrador
// no hay ni cotización ni propuesta de la que colgar. No escribe nada.
router.post('/smo-sugerido', smoSugeridoBorrador);

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
router.get('/cotizaciones/:id/comparar', compararPropuestas);
router.get('/cotizaciones/:id/items/:itemId/plano', planoDeItem);
router.get('/cotizaciones/:id/items/:itemId/despiece', despieceDeItem);

// Propuestas (A/B/C…) de una cotización — 2026-09-20. Las rutas con un segmento
// literal al final (`/clonar`, `/elegir`, `/cargos`, `/smo-sugerido`) van antes
// de las que terminan en ':pid', por el mismo motivo que el bloque de precios:
// si no, "clonar" se leería como el id de una propuesta.
router.post('/cotizaciones/:id/propuestas/:pid/clonar', clonarPropuesta);
router.patch('/cotizaciones/:id/propuestas/:pid/elegir', elegirPropuesta);
router.put('/cotizaciones/:id/propuestas/:pid/cargos', guardarCargosPropuesta);
router.get('/cotizaciones/:id/propuestas/:pid/smo-sugerido', smoSugerido);
router.get('/cotizaciones/:id/propuestas/:pid/pdf', descargarPdfPropuesta);
router.patch('/cotizaciones/:id/propuestas/:pid', actualizarPropuesta);
router.delete('/cotizaciones/:id/propuestas/:pid', eliminarPropuesta);
router.post('/cotizaciones/:id/propuestas', crearPropuesta);

router.get('/cotizaciones/:id', obtenerCotizacion);
router.put('/cotizaciones/:id', actualizarCotizacion);
router.delete('/cotizaciones/:id', eliminarCotizacion);
router.get('/cotizaciones', listarCotizaciones);
router.post('/cotizaciones', crearCotizacion);

// Calibración — literales antes de ':sistema' donde aplica, mismo motivo que arriba.
router.get('/calibracion/sistemas', listarEstadoSistemas);
router.patch('/calibracion/sistemas/:sistema', actualizarEstadoSistema);
router.get('/calibracion/piezas/:sistema', listarPiezasDeSistema);
router.get('/calibracion/contrastes', listarContrastes);
router.post('/calibracion/contrastes', registrarContraste);
router.patch('/calibracion/contrastes/:id/anular', anularContraste);
router.get('/calibracion/analisis', analizarPiezaEndpoint);
router.post('/calibracion/margenes', aprobarMargen);
router.patch('/calibracion/margenes/:id/anular', anularMargen);
router.get('/calibracion/holguras', listarHolguras);
router.post('/calibracion/holguras', fijarHolgura);
router.patch('/calibracion/holguras/:id/anular', anularHolgura);
router.get('/calibracion/historial', listarHistorial);

// Multiplicadores por categoría (configuración de precio de venta).
router.get('/multiplicadores', listarMultiplicadores);
router.put('/multiplicadores/:categoria', guardarMultiplicador);
router.post('/multiplicadores/:categoria/recalcular', recalcularCategoria);

export default router;
