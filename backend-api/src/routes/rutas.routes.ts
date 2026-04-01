import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';
import {
  getODPsParaGestion,
  getRutas,
  getRuta,
  createRuta,
  updateRuta,
  cancelarRuta,
  getVehiculos,
  getInstaladores,
  getMiAsignacion,
  iniciarInstalacion,
  finalizarInstalacion,
  getMiRutaConductor,
  iniciarRutaConductor,
  llegadaConductor,
} from '../controllers/rutas.controller';

const router = Router();
router.use(authMiddleware);

// ─── Rutas estáticas antes de /:id ──────────────────────────────────────────
// Jefe: datos para gestión
router.get('/odps-para-gestion', requireRole('admin', 'gerencia', 'jefe_produccion'), getODPsParaGestion);
router.get('/vehiculos', getVehiculos);
router.get('/personal', getInstaladores);

// Instalador: mi asignación del día
router.get('/mi-asignacion', requireRole('instalador'), getMiAsignacion);
router.post('/ruta-odp/:id/iniciar', requireRole('instalador'), iniciarInstalacion);
router.post('/ruta-odp/:id/finalizar', requireRole('instalador'), uploadConfig.single('foto'), finalizarInstalacion);

// Conductor: su ruta
router.get('/mi-ruta-conductor', requireRole('conductor'), getMiRutaConductor);
router.post('/:id/iniciar-ruta', requireRole('conductor'), iniciarRutaConductor);
router.post('/ruta-odp/:id/llegada', requireRole('conductor'), llegadaConductor);

// ─── CRUD de rutas (jefe) ────────────────────────────────────────────────────
router.get('/', requireRole('admin', 'gerencia', 'jefe_produccion'), getRutas);
router.get('/:id', requireRole('admin', 'gerencia', 'jefe_produccion'), getRuta);
router.post('/', requireRole('admin', 'gerencia', 'jefe_produccion'), createRuta);
router.put('/:id', requireRole('admin', 'gerencia', 'jefe_produccion'), updateRuta);
router.delete('/:id', requireRole('admin', 'gerencia', 'jefe_produccion'), cancelarRuta);

export default router;
