import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import {
  getMetricasSupabase,
  getMetricasCloudinary,
  getHealthServicios,
  getAuditoria,
  revertirAuditoria,
  descargarBackup,
  ejecutarMantenimiento,
  getDiagnosticoODP,
  getOperativoResumen,
  getSeguridadActividad,
  getDetalleUsuario,
  getMonitoreo,
} from '../controllers/root.controller';

const router = Router();

// Solo accesible para el rol root
const soloRoot = authMiddleware;
const requireRoot = (req: any, res: any, next: any) => {
  if (!req.user || req.user.rol !== 'root') {
    return res.status(403).json({ error: 'Acceso exclusivo para rol ROOT' });
  }
  next();
};

router.use(soloRoot, requireRoot);

// Métricas
router.get('/metricas/supabase', getMetricasSupabase);
router.get('/metricas/cloudinary', getMetricasCloudinary);

// Servicios
router.get('/servicios/health', getHealthServicios);

// Auditoría
router.get('/auditoria', getAuditoria);
router.post('/auditoria/:id/revertir', revertirAuditoria);

// Backup (solo descarga: restaurar desde el panel se retiró el 2026-10-23, ver root.controller)
router.get('/backup/descargar', descargarBackup);

// Mantenimiento. Las tareas que borran datos solo corren por POST con `confirmar: true`.
router.get('/mantenimiento/:tarea', ejecutarMantenimiento);
router.post('/mantenimiento/:tarea', ejecutarMantenimiento);

// Diagnóstico, Operativo, Seguridad, Monitoreo
router.get('/diagnostico/odp',     getDiagnosticoODP);
router.get('/operativo/resumen',   getOperativoResumen);
router.get('/seguridad/actividad', getSeguridadActividad);
router.get('/seguridad/detalle-usuario/:userId', getDetalleUsuario);
router.get('/monitoreo',           getMonitoreo);

export default router;
