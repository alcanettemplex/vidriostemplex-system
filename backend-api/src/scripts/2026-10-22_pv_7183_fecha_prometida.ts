/**
 * 2026-10-22_pv_7183_fecha_prometida.ts
 *
 * Cambia la fecha de entrega prometida del Pedido PV 7183 (ODP-24449, Vitelsa)
 * de 2026-10-22 a 2026-11-02, a pedido del usuario.
 *
 * CONTEXTO
 * El pedido se marcó ENVIADO el 2026-10-22 con `fecha_entrega_prometida` igual
 * a la fecha de envío (probablemente quedó el valor por defecto del diálogo).
 *
 * QUÉ HACE
 *   pedido_pv(numero_pedido='7183'): fecha_entrega_prometida → '2026-11-02'
 *
 * QUÉ NO TOCA
 *   - `estado` (ENVIADO), la ODP ni sus checks.
 *   - `alerta_enviada` (false): el cron de tardanza de las 8am avisará el
 *     2026-11-01, víspera de la nueva fecha.
 *
 * Usa el modelo Sequelize (no raw SQL) para que dispare el hook de auditoría, y
 * `requestContext` para firmar la fila de `auditoria_log` como corrección de script.
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-22):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-22_pv_7183_fecha_prometida.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { PedidoPV } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_PEDIDO = '7183';
const FECHA_NUEVA = '2026-11-02';

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
    console.log('Estado actual del pedido:', {
      id: pedido.getDataValue('id'),
      numero_pedido: NUMERO_PEDIDO,
      odp_id: pedido.getDataValue('odp_id'),
      proveedor: pedido.getDataValue('proveedor'),
      estado,
      fecha_entrega_prometida: pedido.getDataValue('fecha_entrega_prometida'),
      fecha_llegada_real: pedido.getDataValue('fecha_llegada_real'),
      alerta_enviada: pedido.getDataValue('alerta_enviada'),
    });

    if (estado !== 'ENVIADO') {
      console.error(`\nABORTA: el pedido está en ${estado}, no en ENVIADO. Revisar a mano.`);
      process.exit(1);
    }

    if (pedido.getDataValue('fecha_llegada_real')) {
      console.error('\nABORTA: el pedido ya tiene llegada registrada. Revisar a mano.');
      process.exit(1);
    }

    // ── Update ────────────────────────────────────────────────────────────────
    await requestContext.run(
      { userId: null, userName: 'SCRIPT 2026-10-22_pv_7183_fecha_prometida', ip: null },
      async () => {
        await pedido.update({ fecha_entrega_prometida: FECHA_NUEVA });
      },
    );

    // ── Verificación ──────────────────────────────────────────────────────────
    const verif = await PedidoPV.findOne({ where: { numero_pedido: NUMERO_PEDIDO } });
    console.log('\nEstado final del pedido:', {
      estado: verif!.getDataValue('estado'),
      fecha_entrega_prometida: verif!.getDataValue('fecha_entrega_prometida'),
      alerta_enviada: verif!.getDataValue('alerta_enviada'),
    });

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
