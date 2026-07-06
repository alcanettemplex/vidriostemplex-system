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
} from '../controllers/crm.controller';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';

const router = Router();

// Módulo exclusivo del rol root — centro de control de supervisión comercial.
router.use(authMiddleware);
router.use(requireRole('root'));

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

// Buscador Avanzado — búsqueda cruzada de ODPs y Leads con filtros detallados
router.get('/buscador/odp', getBuscadorODP);
router.get('/buscador/odp/excel', exportarBuscadorODPExcel);
router.get('/buscador/leads', getBuscadorLeads);
router.get('/buscador/leads/excel', exportarBuscadorLeadsExcel);

export default router;
