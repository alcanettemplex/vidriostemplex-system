import { Router } from 'express';
import {
  getLeads,
  createLead,
  updateLeadStatus,
  assignLeadToMe,
  assignLeadToUser,
  getLeadTimeline,
  updateLeadMonto,
  convertLeadToCliente,
  getCRMStats,
  registerLeadSeguimiento,
  updateLeadDetails,
  searchODPsForLead,
  vincularODPAlLead,
} from '../controllers/crm.controller';
import { requireRole } from '../middlewares/rbacMiddleware';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Todas las rutas de CRM requieren autenticación
router.use(authMiddleware);

// Permisos: Asesor Comercial gestiona, Gerencia vigila, Asistente captura
const ROLES_CRM = ['asesor_comercial', 'admin', 'gerencia', 'gerente', 'root', 'asistente_administrativo'] as any;

// Endpoints
router.get('/', requireRole(...ROLES_CRM), getLeads);
router.post('/', requireRole('asistente_administrativo', 'admin', 'gerencia', 'gerente', 'asesor_comercial'), createLead);

// Operaciones específicas de la tarjeta y seguimiento
router.put('/:id/estado', requireRole('asesor_comercial', 'admin', 'gerencia', 'gerente'), updateLeadStatus);
router.put('/:id/reclamar', requireRole('asesor_comercial', 'admin', 'gerencia', 'gerente'), assignLeadToMe);

// Asignación manual a un asesor específico
router.put('/:id/asignar', requireRole('asistente_administrativo', 'admin', 'gerencia', 'gerente'), assignLeadToUser);

// Timeline y eventos
router.get('/:id/eventos', requireRole(...ROLES_CRM), getLeadTimeline);

// Actualizar monto proyectado de cotización
router.patch('/:id/monto', requireRole(...ROLES_CRM), updateLeadMonto);

// Actualizar detalles generales del lead
router.patch('/:id', requireRole(...ROLES_CRM), updateLeadDetails);

// Registrar intento de seguimiento (Touch)
router.post('/:id/seguimiento', requireRole('asesor_comercial', 'admin', 'gerencia', 'gerente'), registerLeadSeguimiento);

// Conversión Lead → Cliente (solo asesor asignado, admin y gerencia pueden confirmar)
router.post('/:id/convertir', requireRole('asesor_comercial', 'admin', 'gerencia', 'gerente'), convertLeadToCliente);

// Estadísticas gerenciales CRM
router.get('/stats/resumen', requireRole(...ROLES_CRM), getCRMStats);

// Vínculo Lead APROBADO → ODP
router.get('/odps/buscar', requireRole(...ROLES_CRM), searchODPsForLead);
router.patch('/:id/vincular-odp', requireRole('asesor_comercial', 'admin', 'gerencia', 'gerente'), vincularODPAlLead);

export default router;
