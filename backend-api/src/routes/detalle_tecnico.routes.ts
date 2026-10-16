import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware';
import { getDisenoPedido, guardarPlano, eliminarPlano, cambiarLetras, cambiarBloqueo } from '../controllers/detalle_tecnico.controller';

// Detalles técnicos de Pedidos PV (2026-10-16). Los permisos de escritura dependen de
// `puede_gestionar_pv` (no de un rol), así que se verifican dentro del controlador, igual
// que en Pedidos PV. `marketing` queda fuera de toda escritura por el `authMiddleware`.
const router = Router();
router.use(authMiddleware);

router.get('/pedido/:id', getDisenoPedido);
router.put('/pedido/:id/plano/:letra', guardarPlano);
router.delete('/pedido/:id/plano/:letra', eliminarPlano);
router.patch('/pedido/:id/letras', cambiarLetras);
router.patch('/pedido/:id/bloqueo', cambiarBloqueo);

export default router;
