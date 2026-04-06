import { Router } from 'express';
import { 
  getLeads, 
  createLead, 
  updateLeadStatus, 
  assignLeadToMe, 
  getLeadTimeline,
  convertLeadToCliente,
  getCRMStats
} from '../controllers/crm.controller';
import { requireRole } from '../middlewares/rbacMiddleware';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// Todas las rutas de CRM requieren autenticación
router.use(authMiddleware);

// Permisos: Asesor Comercial gestiona, Gerencia vigila, Asistente captura
const ROLES_CRM = ['asesor_comercial', 'admin', 'gerencia', 'root', 'asistente_administrativo'] as any;

// Endpoints
router.get('/', requireRole(...ROLES_CRM), getLeads);
router.post('/', requireRole('asistente_administrativo', 'admin', 'gerencia', 'asesor_comercial'), createLead);

// Operaciones específicas de la tarjeta y seguimiento
router.put('/:id/estado', requireRole('asesor_comercial', 'admin', 'gerencia'), updateLeadStatus);
router.put('/:id/reclamar', requireRole('asesor_comercial', 'admin', 'gerencia'), assignLeadToMe);

// Timeline y eventos
router.get('/:id/eventos', requireRole(...ROLES_CRM), getLeadTimeline);

// Conversión Lead → Cliente (solo asesor asignado, admin y gerencia pueden confirmar)
router.post('/:id/convertir', requireRole('asesor_comercial', 'admin', 'gerencia'), convertLeadToCliente);

// Estadísticas gerenciales CRM
router.get('/stats/resumen', requireRole(...ROLES_CRM), getCRMStats);

export default router;
