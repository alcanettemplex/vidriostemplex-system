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
  crearODPDesdeLead,
  recuperarLead,
  getReporteAsesor,
  getStatsProspectos,
  solicitarVisitaTecnica,
  getLeadImagenes,
  createLeadImagen,
  updateLeadImagenNota,
  deleteLeadImagen,
  getMonitorAsesores,
  getEmbudoAsesores,
  getLeadById,
} from '../controllers/crm.controller';
import { requireRole } from '../middlewares/rbacMiddleware';
import { authMiddleware } from '../middlewares/authMiddleware';
import { uploadLeadsConfig } from '../config/upload';

const router = Router();

// Todas las rutas de CRM requieren autenticación
router.use(authMiddleware);

// Permisos: Asesor Comercial gestiona, Gerencia vigila, Asistente captura, Jefe Producción accede
const ROLES_CRM = ['asesor_comercial', 'admin', 'gerencia', 'root', 'asistente_administrativo', 'jefe_produccion'] as any;
const ROLES_CRM_LECTURA = [...ROLES_CRM, 'marketing'] as any;

// Endpoints
router.get('/', requireRole(...ROLES_CRM_LECTURA), getLeads);
router.post('/', requireRole('asistente_administrativo', 'admin', 'gerencia', 'asesor_comercial', 'jefe_produccion'), createLead);

// Operaciones específicas de la tarjeta y seguimiento
router.put('/:id/estado', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), updateLeadStatus);
router.put('/:id/reclamar', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), assignLeadToMe);

// Asignación manual a un asesor específico
router.put('/:id/asignar', requireRole('asistente_administrativo', 'admin', 'gerencia', 'jefe_produccion'), assignLeadToUser);

// Timeline y eventos
router.get('/:id/eventos', requireRole(...ROLES_CRM_LECTURA), getLeadTimeline);

// Actualizar monto proyectado de cotización
router.patch('/:id/monto', requireRole(...ROLES_CRM), updateLeadMonto);

// Actualizar detalles generales del lead
router.patch('/:id', requireRole(...ROLES_CRM), updateLeadDetails);

// Registrar intento de seguimiento (Touch)
router.post('/:id/seguimiento', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), registerLeadSeguimiento);

// Conversión Lead → Cliente (solo asesor asignado, admin y gerencia pueden confirmar)
router.post('/:id/convertir', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), convertLeadToCliente);

// Estadísticas gerenciales CRM
router.get('/stats/resumen', requireRole(...ROLES_CRM_LECTURA), getCRMStats);
router.get('/stats/prospectos', requireRole(...ROLES_CRM_LECTURA), getStatsProspectos);
router.get('/reporte-asesor', requireRole(...ROLES_CRM_LECTURA), getReporteAsesor);

// Rutas con segmentos literales — DEBEN ir antes de /:id para evitar colisión
router.get('/monitor',      requireRole(...ROLES_CRM_LECTURA), getMonitorAsesores);
router.get('/embudo',       requireRole(...ROLES_CRM_LECTURA), getEmbudoAsesores);
router.get('/odps/buscar',  requireRole(...ROLES_CRM_LECTURA), searchODPsForLead);

// Lead individual por ID (captura cualquier número; va después de los literales)
router.get('/:id', requireRole(...ROLES_CRM_LECTURA), getLeadById);

// Recuperar lead desde "Sin Respuesta" a Bolsa Común
router.put('/:id/recuperar', requireRole('asesor_comercial', 'asistente_administrativo', 'admin', 'gerencia', 'jefe_produccion'), recuperarLead);

// Vínculo Lead APROBADO → ODP
router.patch('/:id/vincular-odp', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), vincularODPAlLead);
router.post('/:id/crear-odp', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), crearODPDesdeLead);

// Solicitar visita técnica desde lead VISITA_TECNICA → crea Prospecto + TM
router.post('/:id/solicitar-visita', requireRole('asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'), solicitarVisitaTecnica);

// Imágenes del lead
router.get('/:id/imagenes', requireRole(...ROLES_CRM_LECTURA), getLeadImagenes);
router.post('/:id/imagenes', requireRole(...ROLES_CRM), uploadLeadsConfig.single('imagen'), createLeadImagen);
router.patch('/:id/imagenes/:imgId', requireRole(...ROLES_CRM), updateLeadImagenNota);
router.delete('/:id/imagenes/:imgId', requireRole(...ROLES_CRM), deleteLeadImagen);

export default router;
