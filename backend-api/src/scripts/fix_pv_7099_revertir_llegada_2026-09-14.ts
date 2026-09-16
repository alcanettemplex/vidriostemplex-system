/**
 * fix_pv_7099_revertir_llegada_2026-09-14.ts
 *
 * Devuelve el Pedido PV 7099 (ODP-24331) de LLEGADO ("Recibido" en la UI) a
 * CONFIRMADO_PROVEEDOR ("Confirmado").
 *
 * CONTEXTO
 * El 2026-09-11 21:51 se registró la llegada del pedido con
 * `fecha_llegada_real = 2026-09-22`: una fecha FUTURA, idéntica a la
 * `fecha_entrega_prometida`. El vidrio no ha llegado — en el diálogo de
 * "Registrar llegada" se dejó la fecha prometida en vez de la real.
 * `dias_diferencia` quedó en 0 por esa misma razón.
 *
 * El flujo de Pedidos PV es unidireccional: no hay acción de UI ni endpoint que
 * retroceda un estado. `PATCH /api/pedidos-pv/:id` tiene whitelist de campos y
 * `estado` no está en ella (pedido_pv.controller.ts). De ahí este one-off.
 *
 * QUÉ HACE
 *   pedido_pv(id=606): estado → 'CONFIRMADO_PROVEEDOR'
 *                      fecha_llegada_real → NULL
 *                      dias_diferencia    → NULL
 *
 * QUÉ NO TOCA
 *   - `confirmado_proveedor` (ya true): coherente con el estado destino.
 *   - `chk_vidrio` de la ODP: ya está en false. El check solo se marca cuando
 *     TODOS los PV de la ODP quedan VERIFICADO, y este nunca se verificó
 *     (`verificado_por = NULL`). No se invoca el motor de checksAutomaticos.
 *   - `odp.estado_produccion` (MEDICION) ni `historial_estados_odp`.
 *   - `alerta_enviada` (false): el pedido reentra al cron de tardanza de las
 *     8am — correcto, el vidrio sigue sin llegar.
 *
 * Usa el modelo Sequelize (no raw SQL) para que dispare el hook de auditoría, y
 * `requestContext` para firmar la fila de `auditoria_log` como corrección de script.
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-09-14):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/fix_pv_7099_revertir_llegada_2026-09-14.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { PedidoPV, ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_PEDIDO = '7099';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conectado a BD.\n');

    const pedido = await PedidoPV.findOne({ where: { numero_pedido: NUMERO_PEDIDO } });

    // ── Guardas ───────────────────────────────────────────────────────────────
    if (!pedido) {
      console.error(`ABORTA: Pedido PV ${NUMERO_PEDIDO} no encontrado.`);
      process.exit(1);
    }

    const estado = pedido.getDataValue('estado');
    const odp_id = pedido.getDataValue('odp_id') as number | null;

    console.log('Estado actual del pedido:', {
      id: pedido.getDataValue('id'),
      numero_pedido: NUMERO_PEDIDO,
      odp_id,
      proveedor: pedido.getDataValue('proveedor'),
      estado,
      confirmado_proveedor: pedido.getDataValue('confirmado_proveedor'),
      fecha_entrega_prometida: pedido.getDataValue('fecha_entrega_prometida'),
      fecha_llegada_real: pedido.getDataValue('fecha_llegada_real'),
      dias_diferencia: pedido.getDataValue('dias_diferencia'),
    });

    if (estado !== 'LLEGADO') {
      console.error(`\nABORTA: el pedido está en ${estado}, no en LLEGADO. Nada que revertir.`);
      process.exit(1);
    }

    if (pedido.getDataValue('verificado_por') || pedido.getDataValue('fecha_verificacion')) {
      console.error('\nABORTA: el pedido tiene verificación registrada. Revisar a mano.');
      process.exit(1);
    }

    if (pedido.getDataValue('tuvo_problema') || pedido.getDataValue('estado_reposicion')) {
      console.error('\nABORTA: el pedido tuvo problema/reposición. Revisar a mano.');
      process.exit(1);
    }

    if (pedido.getDataValue('factura_pv')) {
      console.error(`\nABORTA: el pedido tiene factura ${pedido.getDataValue('factura_pv')}. Revisar con compras.`);
      process.exit(1);
    }

    // El check de vidrio debe seguir en false: si alguien lo marcó, revertir el
    // estado del PV sin tocar el check dejaría la ODP inconsistente.
    if (odp_id) {
      const odp = await ODP.findByPk(odp_id, { attributes: ['id', 'numero_odp', 'estado_produccion', 'chk_vidrio'] });
      console.log('\nODP asociada:', {
        numero_odp: odp?.getDataValue('numero_odp'),
        estado_produccion: odp?.getDataValue('estado_produccion'),
        chk_vidrio: odp?.getDataValue('chk_vidrio'),
      });
      if (odp?.getDataValue('chk_vidrio')) {
        console.error('\nABORTA: la ODP tiene chk_vidrio = true. Revisar a mano antes de retroceder el PV.');
        process.exit(1);
      }
    }

    // ── Update ────────────────────────────────────────────────────────────────
    await requestContext.run(
      { userId: null, userName: 'SCRIPT fix_pv_7099_revertir_llegada_2026-09-14', ip: null },
      async () => {
        await pedido.update({
          estado: 'CONFIRMADO_PROVEEDOR',
          fecha_llegada_real: null,
          dias_diferencia: null,
        });
      },
    );

    console.log('\n✅ PV 7099 → estado: CONFIRMADO_PROVEEDOR, fecha_llegada_real: NULL, dias_diferencia: NULL');

    // ── Verificación ──────────────────────────────────────────────────────────
    const verif = await PedidoPV.findOne({ where: { numero_pedido: NUMERO_PEDIDO } });
    console.log('\nEstado final del pedido:', {
      estado: verif!.getDataValue('estado'),
      confirmado_proveedor: verif!.getDataValue('confirmado_proveedor'),
      fecha_entrega_prometida: verif!.getDataValue('fecha_entrega_prometida'),
      fecha_llegada_real: verif!.getDataValue('fecha_llegada_real'),
      dias_diferencia: verif!.getDataValue('dias_diferencia'),
      alerta_enviada: verif!.getDataValue('alerta_enviada'),
    });

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
