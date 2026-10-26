/**
 * 2026-10-26_vincular_lead3224_odp24473.ts
 *
 * Vincula el lead APROBADO #3224 (DIEGO VALENCIA, 323 4784053) a la ODP-24473 (id 739,
 * cliente OMAIRA ALVAREZ DE VALENCIA, mismo teléfono y mismo asesor, Juan Diego Cataño).
 *
 * QUÉ HACE (decisiones del usuario)
 *   leads(id=3224): odp_id → 739            (lo mismo que hace vincularODPAlLead)
 *                   cliente_id → 1759       (el cliente de la ODP; cuenta como convertido)
 *                   monto_proyectado_cotizacion y monto_real_venta → 2740719
 *                   (el lead decía 2.740.419: $300 menos que el valor_total de la ODP)
 *   lead_eventos:   SEGUIMIENTO "Lead vinculado a ODP-24473." (como el botón del CRM)
 *
 * Guardas: el lead debe seguir APROBADO y sin ODP; la ODP no debe tener otro lead.
 * Modelos Sequelize + requestContext → auditoría firmada como script.
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_vincular_lead3224_odp24473.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { Lead, LeadEvento, ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const LEAD_ID = 3224;
const NUMERO_ODP = 'ODP-24473';
const CLIENTE_ID = 1759;
const USUARIO_ROOT = 30;

(async () => {
  try {
    await sequelize.authenticate();

    const lead = await Lead.findByPk(LEAD_ID);
    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, attributes: ['id', 'cliente_id', 'valor_total'] });
    if (!lead || !odp) { console.error('ABORTA: no se encontró el lead o la ODP.'); process.exit(1); }

    const odpId = odp.getDataValue('id') as number;
    if (lead.getDataValue('estado_crm') !== 'APROBADO') { console.error('ABORTA: el lead ya no está APROBADO.'); process.exit(1); }
    if (lead.getDataValue('odp_id')) { console.error(`ABORTA: el lead ya tiene la ODP id ${lead.getDataValue('odp_id')}.`); process.exit(1); }
    if (odp.getDataValue('cliente_id') !== CLIENTE_ID) { console.error('ABORTA: la ODP ya no es del cliente 1759.'); process.exit(1); }
    const otro = await Lead.count({ where: { odp_id: odpId } });
    if (otro > 0) { console.error('ABORTA: la ODP ya está vinculada a otro lead.'); process.exit(1); }

    const valor = Number(odp.getDataValue('valor_total'));

    await requestContext.run(
      { userId: null, userName: 'SCRIPT 2026-10-26_vincular_lead3224_odp24473', ip: null },
      () => sequelize.transaction(async (t) => {
        await lead.update({
          odp_id: odpId,
          cliente_id: CLIENTE_ID,
          monto_proyectado_cotizacion: valor,
          monto_real_venta: valor,
        }, { transaction: t });
        await LeadEvento.create({
          tipo: 'SEGUIMIENTO',
          detalle_texto: `Lead vinculado a ${NUMERO_ODP}.`,
          lead_id: LEAD_ID,
          creado_por: USUARIO_ROOT,
        }, { transaction: t });
      }),
    );

    console.log(`OK: lead #${LEAD_ID} → ${NUMERO_ODP} (id ${odpId}), cliente ${CLIENTE_ID}, monto ${valor}.`);
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
