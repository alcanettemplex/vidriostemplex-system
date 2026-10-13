import { Router } from 'express';
import {
  getSupervisionResumen,
  getRankingAsesores,
  getSupervisionAltoValor,
  getSupervisionSeguimiento,
  getSupervisionPrimerContacto,
  generarLineamiento,
  getLineamiento,
  marcarItemLineamiento,
  actualizarNotasLineamiento,
  getAdherenciaLineamiento,
  getBuscadorODP,
  exportarBuscadorODPExcel,
  getBuscadorLeads,
  exportarBuscadorLeadsExcel,
  getReporteDiario,
  registrarReporteDiario,
} from '../controllers/crm.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Centro de control de supervisión comercial: root y admin (admin desde el 2026-10-12,
// decisión del usuario; root pasa siempre por requireRole).
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/resumen', getSupervisionResumen);
router.get('/ranking-asesores', getRankingAsesores);
router.get('/alto-valor', getSupervisionAltoValor);
router.get('/seguimiento', getSupervisionSeguimiento);
router.get('/primer-contacto', getSupervisionPrimerContacto);

router.get('/lineamiento/adherencia', getAdherenciaLineamiento);
router.get('/lineamiento', getLineamiento);
router.post('/lineamiento', generarLineamiento);
router.patch('/lineamiento/item/:id', marcarItemLineamiento);
router.patch('/lineamiento/:id/notas', actualizarNotasLineamiento);

// Reporte diario de asesores — mensaje para el grupo de WhatsApp
router.get('/reporte-diario', getReporteDiario);
router.post('/reporte-diario/registrar', registrarReporteDiario);

// Buscador Avanzado — búsqueda cruzada de ODPs y Leads con filtros detallados
router.get('/buscador/odp', getBuscadorODP);
router.get('/buscador/odp/excel', exportarBuscadorODPExcel);
router.get('/buscador/leads', getBuscadorLeads);
router.get('/buscador/leads/excel', exportarBuscadorLeadsExcel);

export default router;
