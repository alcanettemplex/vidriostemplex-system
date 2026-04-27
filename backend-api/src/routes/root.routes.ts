import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import {
  getMetricasSupabase,
  getMetricasCloudinary,
  getHealthServicios,
  getAuditoria,
  revertirAuditoria,
  getAlertas,
  updateAlerta,
  descargarBackup,
  restaurarBackup,
  ejecutarMantenimiento,
  getDiagnosticoODP,
  getOperativoResumen,
  getSeguridadActividad,
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

// Alertas
router.get('/alertas', getAlertas);
router.put('/alertas/:id', updateAlerta);

// Backup
router.get('/backup/descargar', descargarBackup);
router.post('/backup/restaurar', restaurarBackup);

// Mantenimiento
router.get('/mantenimiento/:tarea', ejecutarMantenimiento);
router.post('/mantenimiento/:tarea', ejecutarMantenimiento);

// Diagnóstico, Operativo, Seguridad
router.get('/diagnostico/odp',     getDiagnosticoODP);
router.get('/operativo/resumen',   getOperativoResumen);
router.get('/seguridad/actividad', getSeguridadActividad);

export default router;
