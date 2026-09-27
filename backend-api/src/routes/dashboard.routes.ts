import { Router } from 'express';
import {
  getDashboardData,
  getGeneralData,
  getVentasData,
  getProduccionData,
  getEquipoData,
  getAlertas,
  getCarteraVencida,
  getPedidosFacturados
} from '../controllers/dashboard.controller';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { cacheRespuesta } from '../utils/cacheMemoria';
import {
  exigirAccesoPanelCotizaciones,
  getPanelCotizaciones,
  descargarExcelCotizaciones,
} from '../controllers/dashboard_cotizaciones.controller';
import { claveAlcanceCache } from '../services/dashboardCotizaciones.service';

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
// Pestaña Cotizaciones (Cotizador nuevo, 2026-09-27). Control total ve todo; un asesor
// comercial, solo lo suyo (impuesto en el servicio). La caché va por ALCANCE: control
// total comparte la foto, cada asesor tiene la suya — sin eso, un asesor podría recibir
// la respuesta cacheada de un gerente con la misma URL. TTL corto (5 min): el asesor
// espera ver pronto la cotización que acaba de crear. El Excel no se cachea.
const TTL_COTIZACIONES = 5 * 60 * 1000;
router.get('/cotizaciones', authMiddleware, exigirAccesoPanelCotizaciones,
  cacheRespuesta(TTL_COTIZACIONES, { claveExtra: (req) => claveAlcanceCache(req.user ? { id: Number(req.user.id), rol: String(req.user.rol) } : undefined) }),
  getPanelCotizaciones);
router.get('/cotizaciones/excel', authMiddleware, exigirAccesoPanelCotizaciones, descargarExcelCotizaciones);
router.get('/cartera-vencida', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getCarteraVencida);
router.get('/pedidos-facturados', authMiddleware, requireRole(...DASHBOARD_ROLES), cacheRespuesta(TTL_KPIS), getPedidosFacturados);

export default router;
