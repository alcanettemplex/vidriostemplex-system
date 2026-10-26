/**
 * 2026-10-26_checks_odp24202.ts
 *
 * ODP-24202 (id 428, JARAMILLO LOBO INGENIERIA Y CONSTRUCCION SAS): el usuario confirma que
 * el aluminio y el ensamble ya están hechos, y pide marcar también la medición. Aparecía
 * como "aluminio sin cortar, vencida 56 días" solo porque nadie marcó las casillas.
 *
 * QUÉ HACE: chk_medicion, chk_corte, chk_ensamble → true.
 * QUÉ NO TOCA: estado (PROGRAMADA, ruta #596 de hoy): el avance por check solo aplica en
 * etapas tempranas. Las 8 programaciones son normales: proyecto grande, por etapas.
 *
 * AUDITORÍA: se espera la fila antes de cerrar la conexión (TECH_DEBT.md 2026-10-26).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_checks_odp24202.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Op } from 'sequelize';
import sequelize from '../config/database';
import { ODP, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const ACTOR = 'SCRIPT 2026-10-26_checks_odp24202';

(async () => {
  try {
    await sequelize.authenticate();
    const odp = await ODP.findOne({ where: { numero_odp: 'ODP-24202' } });
    if (!odp) throw new Error('ODP-24202 no existe');

    const inicio = new Date();
    await requestContext.run(
      { userId: 30, userName: ACTOR, ip: null },
      () => sequelize.transaction((t) => odp.update({ chk_medicion: true, chk_corte: true, chk_ensamble: true }, { transaction: t })),
    );

    let auditadas = 0;
    for (let i = 0; i < 30 && auditadas < 1; i++) {
      auditadas = await AuditoriaLog.count({ where: { usuario_nombre: ACTOR, fecha: { [Op.gte]: inicio } } });
      if (!auditadas) await new Promise(r => setTimeout(r, 500));
    }
    console.log(`OK: ODP-24202 medición, corte y ensamble marcados (estado ${odp.getDataValue('estado_produccion')}). Auditoría: ${auditadas}/1.`);
    await sequelize.close();
    if (!auditadas) process.exit(2);
  } catch (err: any) {
    console.error('ABORTA:', err.message ?? err);
    process.exit(1);
  }
})();
