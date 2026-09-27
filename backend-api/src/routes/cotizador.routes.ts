import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
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
  cambiarSegmento,
  crearPropuesta,
  clonarPropuesta,
  actualizarPropuesta,
  elegirPropuesta,
  eliminarPropuesta,
  guardarCargosPropuesta,
  compararPropuestas,
  manoObraBorrador,
  descargarPdfPropuesta,
  buscarVinculos,
  listarAsesoresCotizador,
  obtenerVinculo,
  crearLeadRapido,
  previaCrearOdp,
  crearOdpDesdeCotizacion,
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
  buscarCatalogoGeneral,
  importarDesdeCatalogoGeneral,
} from '../controllers/cotizador_catalogo_general.controller';
import {
  listarMultiplicadores,
  guardarMultiplicador,
  recalcularCategoria,
} from '../controllers/cotizador_multiplicadores.controller';

import { exigirDuenoParaEscribir, puedeCrear, soloControlTotal } from '../cotizador/lib/permisos';

const router = Router();

// Integrado al ERP desde el 2026-09-27 (ver `cotizador/lib/permisos.ts`): todo
// usuario autenticado VE las cotizaciones; crear exige un rol de trabajo; editar
// una cotización exige ser su asesor o control total; configuración,
// calibración, precios y costos son solo de control total. El rol de solo
// lectura global (marketing) lo sigue cortando `authMiddleware`.
router.use(authMiddleware);

// Estado y recarga van ANTES del gate de disponibilidad: son las únicas rutas
// que deben poder responder aunque la caché del cotizador esté caída.
router.get('/estado', estadoCotizador);
router.post('/recargar', soloControlTotal, recargarCotizador);

router.use(requireCotizadorDisponible);

router.get('/disenos', getDisenos);
router.get('/catalogo', getCatalogo);
router.get('/parametros', getParametrosGlobales);
router.put('/parametros', soloControlTotal, editarParametros);
router.get('/modulos', getModulos);

router.post('/cotizar/:moduloId', cotizarItem);

// Mano de obra por producto (ensamble e instalación) de un juego de ítems,
// guardados o no: los ítems viajan en el cuerpo. Fuera de `/cotizaciones/:id` a
// propósito: en un borrador no hay ni cotización ni propuesta. No escribe nada.
router.post('/mano-obra', manoObraBorrador);

router.get('/plano', previsualizarPlano);

router.get('/empresa', obtenerEmpresa);
router.put('/empresa', soloControlTotal, actualizarEmpresa);

// Literales antes de ':codigo' — si no, "historial" se leería como un código.
// Precios y costos: solo control total (mismo criterio que Proveedores).
router.get('/precios/historial', soloControlTotal, historialPrecios);
router.get('/precios/:codigo', soloControlTotal, obtenerPrecio);
router.put('/precios/:codigo', soloControlTotal, editarPrecio);
router.delete('/precios/:codigo', soloControlTotal, darDeBajaPrecio);
router.get('/precios', soloControlTotal, listarPrecios);
router.post('/precios', soloControlTotal, crearPrecio);

// Traer productos del catálogo general del ERP, vinculados a Proveedores (2026-09-23).
router.get('/catalogo-general', buscarCatalogoGeneral);
router.post('/catalogo-general/importar', soloControlTotal, importarDesdeCatalogoGeneral);

// Vínculo con el ERP (2026-09-27): "¿Para quién es esta cotización?". Buscar y
// leer: cualquiera que vea el Cotizador. El lead rápido crea un lead real del
// CRM: exige poder crear cotizaciones (no hay cotización sin vínculo).
// Literales antes de ':tipo/:id'.
router.get('/vinculos/buscar', buscarVinculos);
router.get('/vinculos/asesores', listarAsesoresCotizador);
router.post('/vinculos/lead-rapido', puedeCrear, crearLeadRapido);
router.get('/vinculos/:tipo/:id', obtenerVinculo);

// Toda escritura sobre una cotización exige ser su asesor o control total.
router.use('/cotizaciones/:id', exigirDuenoParaEscribir);

// "Crear ODP" desde una cotización aprobada (2026-09-27): el GET solo
// previsualiza; el POST pasa además por el guardia de dueño de arriba y por los
// permisos del flujo que reutiliza (ver `cotizador/lib/vinculos.ts`).
router.get('/cotizaciones/:id/crear-odp', previaCrearOdp);
router.post('/cotizaciones/:id/crear-odp', crearOdpDesdeCotizacion);

// Literales antes de ':id' — mismo motivo.
router.get('/cotizaciones/:id/aptitud', aptitudCotizacion);
router.get('/cotizaciones/:id/comparar', compararPropuestas);
router.get('/cotizaciones/:id/items/:itemId/plano', planoDeItem);
router.get('/cotizaciones/:id/items/:itemId/despiece', despieceDeItem);
router.patch('/cotizaciones/:id/segmento', cambiarSegmento);

// Propuestas (A/B/C…) de una cotización — 2026-09-20. Las rutas con un segmento
// literal al final (`/clonar`, `/elegir`, `/cargos`) van antes
// de las que terminan en ':pid', por el mismo motivo que el bloque de precios:
// si no, "clonar" se leería como el id de una propuesta.
router.post('/cotizaciones/:id/propuestas/:pid/clonar', clonarPropuesta);
router.patch('/cotizaciones/:id/propuestas/:pid/elegir', elegirPropuesta);
router.put('/cotizaciones/:id/propuestas/:pid/cargos', guardarCargosPropuesta);
router.get('/cotizaciones/:id/propuestas/:pid/pdf', descargarPdfPropuesta);
router.patch('/cotizaciones/:id/propuestas/:pid', actualizarPropuesta);
router.delete('/cotizaciones/:id/propuestas/:pid', eliminarPropuesta);
router.post('/cotizaciones/:id/propuestas', crearPropuesta);

router.get('/cotizaciones/:id', obtenerCotizacion);
router.put('/cotizaciones/:id', actualizarCotizacion);
router.delete('/cotizaciones/:id', eliminarCotizacion);
router.get('/cotizaciones', listarCotizaciones);
router.post('/cotizaciones', puedeCrear, crearCotizacion);

// Calibración — literales antes de ':sistema' donde aplica, mismo motivo que arriba.
router.use('/calibracion', soloControlTotal);
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
router.use('/multiplicadores', soloControlTotal);
router.get('/multiplicadores', listarMultiplicadores);
router.put('/multiplicadores/:categoria', guardarMultiplicador);
router.post('/multiplicadores/:categoria/recalcular', recalcularCategoria);

export default router;
