// Vincula el lead 2110 ("GRUPO INTEGRA JS . S,A,S. ALEX PEDROSO", APROBADO hoy) con
// ODP-24304 (id 548, cliente GRUPO INTEGRA J.S S.A.S, id 1688) — mismo cliente en ambos.
// Replica exactamente la lógica de vincularODPAlLead (crm.controller.ts ~L1552):
// lead.update({ odp_id }) + LeadEvento tipo SEGUIMIENTO. Se verificó antes que ningún
// otro lead ya apunte a esta ODP.
import { sequelize, Lead, LeadEvento, ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const LEAD_ID = 2110;
const ODP_ID = 548; // ODP-24304

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const lead = await Lead.findByPk(LEAD_ID, { transaction: t });
      if (!lead) throw new Error(`Lead ${LEAD_ID} no encontrado`);
      if (lead.getDataValue('estado_crm') !== 'APROBADO') {
        throw new Error(`Lead ${LEAD_ID} no está APROBADO (estado actual: ${lead.getDataValue('estado_crm')})`);
      }
      if (lead.getDataValue('odp_id')) {
        throw new Error(`Lead ${LEAD_ID} ya tiene odp_id=${lead.getDataValue('odp_id')}, abortando`);
      }

      const odp = await ODP.findByPk(ODP_ID, { transaction: t });
      if (!odp) throw new Error(`ODP id=${ODP_ID} no encontrada`);

      await lead.update({ odp_id: ODP_ID }, { transaction: t });

      await LeadEvento.create(
        {
          tipo: 'SEGUIMIENTO',
          detalle_texto: `Lead vinculado a ODP #${ODP_ID}.`,
          lead_id: LEAD_ID,
          creado_por: 30,
        },
        { transaction: t }
      );

      await t.commit();
      console.log(`Lead ${LEAD_ID} vinculado a ODP-${odp.getDataValue('numero_odp')} (id ${ODP_ID})`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
