/**
 * 2026-10-26_fecha_pv7191_odp24457.ts
 *
 * Pedido PV 7191 (ODP-24457, Vitelsa, CONFIRMADO_PROVEEDOR): fecha de entrega prometida
 * 2026-10-22 → 2026-11-03, a pedido del usuario.
 *
 * También `alerta_enviada` → false: el cron de las 8 a. m. (server.ts) avisa una sola vez
 * por pedido vencido y ya avisó con la fecha vieja; sin reiniciarla, si el 3-nov también
 * se incumple no volvería a avisar. Nota en `observaciones` como rastro del cambio.
 *
 * AUDITORÍA: se espera la fila antes de cerrar la conexión (TECH_DEBT.md 2026-10-26).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_fecha_pv7191_odp24457.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Op } from 'sequelize';
import sequelize from '../config/database';
import { PedidoPV, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const ACTOR = 'SCRIPT 2026-10-26_fecha_pv7191_odp24457';
const NOTA = '26-oct-2026: fecha prometida 22-oct → 03-nov-2026.';

(async () => {
  try {
    await sequelize.authenticate();
    const pedido = await PedidoPV.findOne({ where: { numero_pedido: '7191' } });
    if (!pedido || pedido.getDataValue('id') !== 700) throw new Error('el pedido 7191 no es el esperado (id 700)');
    if (pedido.getDataValue('fecha_llegada_real')) throw new Error('el pedido ya registró llegada');
    if (pedido.getDataValue('fecha_entrega_prometida') !== '2026-10-22') {
      throw new Error(`la fecha prometida ya no es 2026-10-22 (es ${pedido.getDataValue('fecha_entrega_prometida')})`);
    }

    const obs = (pedido.getDataValue('observaciones') as string | null)?.trim();
    const inicio = new Date();
    await requestContext.run(
      { userId: 30, userName: ACTOR, ip: null },
      () => sequelize.transaction((t) => pedido.update({
        fecha_entrega_prometida: '2026-11-03',
        alerta_enviada: false,
        observaciones: obs ? `${obs}\n${NOTA}` : NOTA,
      }, { transaction: t })),
    );

    let auditadas = 0;
    for (let i = 0; i < 30 && auditadas < 1; i++) {
      auditadas = await AuditoriaLog.count({ where: { usuario_nombre: ACTOR, fecha: { [Op.gte]: inicio } } });
      if (!auditadas) await new Promise(r => setTimeout(r, 500));
    }
    console.log(`OK: pedido 7191 → entrega prometida 2026-11-03. Auditoría: ${auditadas}/1.`);
    await sequelize.close();
    if (!auditadas) process.exit(2);
  } catch (err: any) {
    console.error('ABORTA:', err.message ?? err);
    process.exit(1);
  }
})();
