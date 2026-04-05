import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/rbacMiddleware';
import {
  getPedidosPV,
  getPedidoPV,
  createPedidoPV,
  updatePedidoPV,
  marcarEnviado,
  confirmarProveedor,
  registrarLlegada,
  verificarPedido,
  marcarProblema,
  getSiguienteNumero,
  getPorGestionar,
  asignarItems,
} from '../controllers/pedido_pv.controller';

const router = Router();
router.use(authMiddleware);

// Lectura — todos los autenticados
router.get('/', getPedidosPV);
router.get('/siguiente-numero', getSiguienteNumero);
router.get('/por-gestionar', getPorGestionar);
router.get('/:id', getPedidoPV);

// Creación y edición — solo quien tiene puede_gestionar_pv (verificado dentro del controller)
router.post('/', createPedidoPV);
router.patch('/:id', updatePedidoPV);

// Acciones de seguimiento — Alejandro (asesor_comercial) puede enviar y confirmar
router.patch('/:id/enviar', requireRole('asesor_comercial', 'admin', 'gerencia'), marcarEnviado);
router.patch('/:id/confirmar-proveedor', requireRole('asesor_comercial', 'admin', 'gerencia'), confirmarProveedor);

// Llegada y verificación — produccion y compras
router.patch('/:id/registrar-llegada', requireRole('produccion', 'compras', 'admin', 'jefe_produccion'), registrarLlegada);
router.patch('/:id/verificar', requireRole('produccion', 'compras', 'admin', 'jefe_produccion'), verificarPedido);
router.patch('/:id/problema', requireRole('produccion', 'compras', 'admin', 'jefe_produccion'), marcarProblema);

// Asignación de ítems — quien tiene puede_gestionar_pv (verificado en controller)
router.patch('/:id/asignar-items', asignarItems);

export default router;
