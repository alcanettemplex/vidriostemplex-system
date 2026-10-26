/**
 * 2026-10-26_marcar_nc_odp24001.ts
 *
 * Marca la ODP-24001 (id 218, INGENIERIA Y CONSTRUCCIÓN EL DIAMANTE, asesora Nataly
 * Londoño) como No Conformidad. Se registró como ODP normal aunque su observación dice
 * "es una NO CONFORMIDAD"; por eso Contabilidad la contaba como pendiente de factura.
 * Mismo patrón que `marcar_nc_odp23891_23857_2026-09-21.ts` (NC sin ODP padre: la
 * original no está en el sistema; la otra ODP del cliente, ODP-24069, es posterior).
 *
 * QUÉ HACE
 *   es_no_conformidad → true
 *   estado_caja       → CANCELADO (las NC no cobran; createODP lo fuerza igual)
 *
 * QUÉ NO TOCA: estado_produccion (ENTREGADA), factura (no lleva), forma_pago, rutas.
 * La salida de almacén ("SA de NC") la registra compras/producción en Facturas vs Salidas.
 *
 * ⚠️ AUDITORÍA: la primera versión hizo `odp.update()` sin transacción y cerró la conexión
 * enseguida; el hook `afterUpdate` graba `auditoria_log` sin esperar (fire-and-forget en
 * models/index.ts) y esa fila se perdió. El cambio quedó aplicado, pero sin fila de
 * auditoría (antes: es_no_conformidad=false, estado_caja=CREDITO_APROBADO). Abajo va
 * dentro de `sequelize.transaction`, como los demás scripts del día, cuya auditoría sí quedó:
 * el commit da tiempo a que la fila se escriba, pero no lo garantiza (ver TECH_DEBT.md).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_marcar_nc_odp24001.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24001';

(async () => {
  try {
    await sequelize.authenticate();

    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP } });
    if (!odp) { console.error(`ABORTA: ${NUMERO_ODP} no existe.`); process.exit(1); }
    if (odp.getDataValue('es_no_conformidad')) { console.error('ABORTA: ya está marcada como NC.'); process.exit(1); }
    if (odp.getDataValue('factura_electronica')) { console.error('ABORTA: tiene factura electrónica; revisar a mano.'); process.exit(1); }

    const cajaAnterior = odp.getDataValue('estado_caja');
    await requestContext.run(
      { userId: 30, userName: 'SCRIPT 2026-10-26_marcar_nc_odp24001', ip: null },
      () => sequelize.transaction((t) => odp.update({ es_no_conformidad: true, estado_caja: 'CANCELADO' }, { transaction: t })),
    );

    console.log(`OK: ${NUMERO_ODP} marcada como NC; estado_caja ${cajaAnterior} → CANCELADO.`);
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
