import { Router } from 'express';
import {
  getDashboardData,
  getGeneralData,
  getVentasData,
  getProduccionData,
  getEquipoData,
  getAlertas,
  getCotizacionesData,
  getCarteraVencida,
  getPedidosFacturados
} from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { cacheRespuesta } from '../utils/cacheMemoria';

const router = Router();

const DASHBOARD_ROLES = ['admin', 'gerencia', 'jefe_produccion', 'contabilidad', 'root', 'asesor_comercial', 'produccion', 'compras', 'asistente_administrativo', 'marketing'] as const;

// KPIs analíticos por período (sums/counts por fecha): cacheables 30 min. Son globales
// por período, así que la caché de respuesta se comparte entre usuarios del mismo rango.
// `/alertas` queda SIN caché a propósito (debe reflejar el estado actual al instante).
const TTL_KPIS = 30 * 60 * 1000;

router.get('/', authMiddleware, requireRole(...DASHBOARD_ROLES), getDashboardData);
router.get('/general', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getGeneralData);
router.get('/ventas', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getVentasData);
router.get('/produccion', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getProduccionData);
router.get('/equipo', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getEquipoData);
router.get('/alertas',       authMiddleware, requireRole(...DASHBOARD_ROLES), getAlertas);
router.get('/cotizaciones', authMiddleware, requireRole('admin', 'gerencia', 'root'), cacheRespuesta(TTL_KPIS), getCotizacionesData);
router.get('/cartera-vencida', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getCarteraVencida);
router.get('/pedidos-facturados', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getPedidosFacturados);

export default router;
