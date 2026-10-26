/**
 * 2026-10-26_anular_odp23868.ts
 *
 * Anula la ODP-23868 (id 73, GRUPO VI / P SAS, asesora Nataly Londoño) a pedido del
 * usuario: "el cliente no quiso continuar con el proceso".
 *
 * Replica `anularODP` (PATCH /api/odp/:id/anular): estado_produccion → ANULADA y una fila
 * en historial_estados_odp con el estado anterior (ENTREGADA), que es lo que usa
 * "Reactivar ODP" para volver atrás. No toca Pedido PV 6761 (VERIFICADO) ni SAP #36
 * (borrador), igual que el endpoint. Sin notificación por socket: el ciclo de imports de
 * `server` no deja usarla desde un script; las pantallas lo ven al recargar.
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_anular_odp23868.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { ODP, HistorialEstadoODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-23868';
const MOTIVO = 'Anulada: el cliente no quiso continuar con el proceso.';
const USUARIO_ROOT = 30;

(async () => {
  try {
    await sequelize.authenticate();

    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP } });
    if (!odp) { console.error(`ABORTA: ${NUMERO_ODP} no existe.`); process.exit(1); }
    const estadoActual = odp.getDataValue('estado_produccion') as string;
    if (estadoActual === 'ANULADA') { console.error('ABORTA: la ODP ya está anulada.'); process.exit(1); }

    await requestContext.run(
      { userId: USUARIO_ROOT, userName: 'SCRIPT 2026-10-26_anular_odp23868', ip: null },
      () => sequelize.transaction(async (t) => {
        await odp.update({ estado_produccion: 'ANULADA' }, { transaction: t });
        await HistorialEstadoODP.create({
          odp_id: odp.getDataValue('id'),
          estado_anterior: estadoActual,
          estado_nuevo: 'ANULADA',
          usuario_id: USUARIO_ROOT,
          fecha: new Date(),
          observacion: MOTIVO,
        }, { transaction: t });
      }),
    );

    console.log(`OK: ${NUMERO_ODP} ${estadoActual} → ANULADA.`);
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
