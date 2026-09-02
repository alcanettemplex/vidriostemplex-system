import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import { uploadConfig } from '../config/upload';
import {
  getODPsParaGestion,
  getRutas,
  getRutasHistorial,
  getRuta,
  getRutasProgramacion,
  createRuta,
  updateRuta,
  cancelarRuta,
  getVehiculos,
  getInstaladores,
  getMiAsignacion,
  getAsignacionInstalador,
  iniciarInstalacion,
  finalizarInstalacion,
  pausarInstalacion,
  reportarDano,
  getMiRutaConductor,
  getMiHistorialConductor,
  iniciarRutaConductor,
  llegadaConductor,
  terminarRutaConductor,
  getODPsAtascadas,
  reprogramarAtascada,
  entregarAtascada,
} from '../controllers/rutas.controller';
import {
  getAgenda,
  colocarEnAgenda,
  actualizarAgenda,
  reordenarAgenda,
  quitarDeAgenda,
} from '../controllers/agenda.controller';

const router = Router();
router.use(authMiddleware);

// ─── Agenda tentativa de instalaciones (planeación previa a la ruta) ─────────
// 'marketing' es solo lectura: puede consultar la gestión de instalaciones pero nunca
// escribir (bloqueado por método HTTP en authMiddleware), por eso no está en ESCRITURA_GESTION.
const LECTURA_GESTION = ['admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo', 'marketing'] as const;
const ESCRITURA_GESTION = ['admin', 'gerencia', 'jefe_produccion', 'produccion'] as const;

router.get('/agenda', requireRole(...LECTURA_GESTION), getAgenda);
router.post('/agenda', requireRole(...ESCRITURA_GESTION), colocarEnAgenda);
router.post('/agenda/reordenar', requireRole(...ESCRITURA_GESTION), reordenarAgenda);
router.put('/agenda/:id', requireRole(...ESCRITURA_GESTION), actualizarAgenda);
router.delete('/agenda/:id', requireRole(...ESCRITURA_GESTION), quitarDeAgenda);

// ─── Rutas estáticas antes de /:id ──────────────────────────────────────────
// Jefe: datos para gestión
router.get('/odps-para-gestion', requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo', 'marketing'), getODPsParaGestion);
router.get('/programacion', requireRole('admin', 'gerencia', 'jefe_produccion', 'compras', 'produccion', 'asistente_administrativo', 'marketing'), getRutasProgramacion);
router.get('/historial', requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo', 'marketing'), getRutasHistorial);
router.get('/vehiculos', getVehiculos);
router.get('/personal', getInstaladores);

// Jefe: instalaciones sin cerrar (rescate). El parámetro es odp.id —no ruta_odp.id—
// porque hay ODPs colgadas que nunca tuvieron parada de ruta.
router.get('/atascadas', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), getODPsAtascadas);
router.post('/atascadas/:odpId/reprogramar', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), reprogramarAtascada);
router.post('/atascadas/:odpId/entregar', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), entregarAtascada);

// Instalador: mi asignación del día
router.get('/mi-asignacion', requireRole('instalador'), getMiAsignacion);
// Jefe: asignación de un instalador específico
router.get('/instalador/:id', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), getAsignacionInstalador);
router.post('/ruta-odp/:id/iniciar', requireRole('instalador'), iniciarInstalacion);
router.post('/ruta-odp/:id/finalizar', requireRole('instalador', 'produccion', 'jefe_produccion', 'admin', 'gerencia'), uploadConfig.array('fotos', 10), finalizarInstalacion);
router.post('/ruta-odp/:id/pausar', requireRole('instalador', 'jefe_produccion', 'admin', 'gerencia', 'produccion'), pausarInstalacion);
router.post('/ruta-odp/:id/reportar-dano', requireRole('instalador'), uploadConfig.single('foto_dano'), reportarDano);

// Conductor: su ruta.
// El historial va antes que '/:id' —y como sub-ruta estática— para que Express no lo
// capture como parámetro; devuelve payload ligero y se pide solo al abrir su tab.
router.get('/mi-ruta-conductor/historial', requireRole('conductor'), getMiHistorialConductor);
router.get('/mi-ruta-conductor', requireRole('conductor'), getMiRutaConductor);
router.post('/:id/iniciar-ruta', requireRole('conductor'), iniciarRutaConductor);
router.post('/:id/terminar-ruta', requireRole('conductor'), terminarRutaConductor);
router.post('/ruta-odp/:id/llegada', requireRole('conductor'), llegadaConductor);

// ─── CRUD de rutas (jefe) ────────────────────────────────────────────────────
router.get('/', requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo', 'marketing'), getRutas);
router.get('/:id', requireRole('admin', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo', 'marketing'), getRuta);
router.post('/', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), createRuta);
router.put('/:id', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), updateRuta);
router.delete('/:id', requireRole('admin', 'gerencia', 'jefe_produccion', 'produccion'), cancelarRuta);

export default router;
