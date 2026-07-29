import { Router, Request, Response, NextFunction } from 'express';
import { getODPs, getODP, createODP, updateODP, deleteODP, finalizarInstalacionODP, uploadCroquisODP, revisarDano, getGarantias, getNcGarantias, crearGarantia, facturarODP, actualizarEstadoCaja, aprobarSinItems, agregarItems, getCargaPorMes, getCargaPorFecha, getHistorialODP, agregarFacturaAdicional, eliminarFacturaAdicional } from '../controllers/odp.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';
import { cacheRespuesta } from '../utils/cacheMemoria';

const router = Router();

// Caché de listados: los GET de lista son el mayor consumidor de egress del sistema
// (la tabla `odp` se devolvía completa ~195 veces/día). Con 13 usuarios concurrentes
// mirando el mismo tablero, esto colapsa las cargas repetidas en una sola lectura.
//
// Seguro por diseño: getODPs NO filtra por `req.user` — todos ven el mismo conjunto —
// y la clave de caché es método+URL, así que los perfiles (`?vista=`), los filtros de
// estado y la paginación no se mezclan entre sí.
//
// La frescura no depende del TTL: toda escritura de ODP invalida la caché desde
// `emitirODPPatch`/`notificarCambioEstadoODP` (ver utils/notificaciones.ts), y los
// cambios en vivo siguen llegando por socket. El TTL es solo la red de seguridad.
const TTL_LISTADOS_ODP = 90_000;

/**
 * Igual que `cacheRespuesta`, pero deja pasar las búsquedas sin cachear.
 *
 * El store es un Map acotado por número de entradas, no por peso. Los listados pesan
 * cientos de KB, mientras que cada término de búsqueda produce una clave distinta que
 * casi nunca se repite: cachearlas llenaría el store de entradas de un solo uso y
 * terminaría desalojando justo las que sí se comparten entre los 13 usuarios.
 */
const cacheListados = (ttlMs: number) => {
  const middleware = cacheRespuesta(ttlMs);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.query.search) { next(); return; }
    middleware(req, res, next);
  };
};

// Lectura: todos los autenticados
router.get('/', authMiddleware, cacheListados(TTL_LISTADOS_ODP), getODPs);

// Rutas con segmento fijo — deben ir ANTES de /:id para no ser capturadas por ese patrón
router.get('/carga-por-fecha', authMiddleware, getCargaPorMes);
router.get('/carga-por-fecha/:fecha', authMiddleware, getCargaPorFecha);
router.get('/garantias/all', authMiddleware, cacheListados(TTL_LISTADOS_ODP), getGarantias);
router.get('/nc-garantias', authMiddleware, cacheListados(TTL_LISTADOS_ODP), getNcGarantias);

router.get('/:id/historial', authMiddleware, getHistorialODP);
router.get('/:id', authMiddleware, getODP);

// Creación: asesores, admin, gerencia, jefe_produccion
router.post('/', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createODP);

// Actualización: asesores, admin, gerencia, jefe_produccion, produccion
router.put('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion'), updateODP);

// Eliminación: solo el creador (owner check en controller) + admin + gerencia
router.delete('/:id', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), deleteODP);

// Finalizar instalación: instaladores, admin, gerencia, producción
router.post('/:id/instalacion', authMiddleware, requireRole('admin', 'gerencia', 'jefe_produccion', 'instalador'), uploadConfig.single('foto'), finalizarInstalacionODP);

// Subida de croquis: asesores, admin, gerencia, jefe_produccion
router.post('/:id/croquis', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), uploadConfig.single('croquis'), uploadCroquisODP);

// Marcar daño de instalación como revisado: dueño (cualquier rol), admin, gerencia, producción, jefe_producción (check en controller)
router.patch('/:id/revisar-dano', authMiddleware, revisarDano);

// Facturación: contabilidad, admin, gerencia pueden registrar/actualizar FE
router.patch('/:id/facturar', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), facturarODP);

// Estado de caja: contabilidad, admin, gerencia pueden cambiar estado_caja manualmente
router.patch('/:id/caja', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), actualizarEstadoCaja);

// Facturas electrónicas adicionales (2ª/3ª): contabilidad, admin, gerencia
router.post('/:id/facturas-adicionales', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), agregarFacturaAdicional);
router.delete('/:id/facturas-adicionales/:facturaId', authMiddleware, requireRole('admin', 'gerencia', 'contabilidad'), eliminarFacturaAdicional);

// Aprobar ODP sin requerimientos (pago adelantado): asesor creador, admin, gerencia
router.patch('/:id/aprobar-sin-items', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), aprobarSinItems);

// Agregar ítems a ODP existente (desde módulo PedidosPV — puede_gestionar_pv)
router.post('/:id/items', authMiddleware, requireRole('admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion', 'compras'), agregarItems);

// Creación de garantía desde una ODP padre. La validación de permisos
// (roles permitidos o dueño de la ODP) se hace dentro del controlador.
router.post('/:id/garantia', authMiddleware, crearGarantia);

export default router;

