/**
 * 2026-10-26_marcar_nc_odp23850_23856_23858.ts
 *
 * Marca como No Conformidad tres ODP de abril que lo dicen en su observación pero se
 * registraron como ODP normal (salieron de una revisión por texto del 2026-10-26):
 *   ODP-23850  "NO CONFORMIDAD DE LA ODP 23818"
 *   ODP-23856  "No Conformidad ODP-23787 …"
 *   ODP-23858  "NO CONFORMIDAD DE LA ODP 23801"
 * Sus ODP origen no existen en el sistema: quedan sin `odp_padre_id`, como ODP-23891,
 * ODP-23857 y ODP-24001.
 *
 * QUÉ HACE: es_no_conformidad → true. estado_caja ya es CANCELADO en las tres.
 * QUÉ NO TOCA: estado_facturacion (FACTURADA sin FE), pagos (el de $1 de 23850), salidas
 * de almacén (ya tienen SA), estado de producción.
 *
 * AUDITORÍA: el hook graba `auditoria_log` sin esperar; por eso, antes de cerrar la
 * conexión, se espera a ver la fila de cada ODP (ver TECH_DEBT.md 2026-10-26).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_marcar_nc_odp23850_23856_23858.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Op } from 'sequelize';
import sequelize from '../config/database';
import { ODP, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMEROS_ODP = ['ODP-23850', 'ODP-23856', 'ODP-23858'];
const ACTOR = 'SCRIPT 2026-10-26_marcar_nc_odp23850_23856_23858';

(async () => {
  try {
    await sequelize.authenticate();

    const odps = await ODP.findAll({ where: { numero_odp: NUMEROS_ODP } });
    if (odps.length !== NUMEROS_ODP.length) { console.error('ABORTA: falta alguna ODP.'); process.exit(1); }
    for (const o of odps) {
      if (o.getDataValue('es_no_conformidad')) { console.error(`ABORTA: ${o.getDataValue('numero_odp')} ya es NC.`); process.exit(1); }
      if (o.getDataValue('factura_electronica')) { console.error(`ABORTA: ${o.getDataValue('numero_odp')} tiene FE.`); process.exit(1); }
      if (o.getDataValue('estado_caja') !== 'CANCELADO') { console.error(`ABORTA: ${o.getDataValue('numero_odp')} no está en CANCELADO.`); process.exit(1); }
    }

    const inicio = new Date();
    await requestContext.run(
      { userId: 30, userName: ACTOR, ip: null },
      () => sequelize.transaction(async (t) => {
        for (const o of odps) await o.update({ es_no_conformidad: true }, { transaction: t });
      }),
    );

    // Esperar las filas de auditoría (máx. 15 s) antes de cerrar la conexión.
    const ids = odps.map(o => String(o.getDataValue('id')));
    let auditadas = 0;
    for (let i = 0; i < 30; i++) {
      auditadas = await AuditoriaLog.count({
        where: { tabla: 'odp', registro_id: ids, usuario_nombre: ACTOR, fecha: { [Op.gte]: inicio } },
      });
      if (auditadas >= ids.length) break;
      await new Promise(r => setTimeout(r, 500));
    }

    for (const o of odps) console.log(`OK: ${o.getDataValue('numero_odp')} (id ${o.getDataValue('id')}) marcada como NC.`);
    console.log(`Auditoría: ${auditadas}/${ids.length} filas.`);
    await sequelize.close();
    if (auditadas < ids.length) process.exit(2);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
