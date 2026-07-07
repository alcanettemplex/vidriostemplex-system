// Vinculacion puntual solicitada por el usuario: lead 1360 (MONICA SALAZAR SOTO, estado
// APROBADO) corresponde a la ODP-24142 (id 363, cliente_id 1600 "MONICA SALAZAR SOTO",
// mismo nombre y mismo telefono " 300 6126978"). Sin conflicto de cliente_id -- el lead no
// tenia cliente_id asignado. Replica exactamente la logica del endpoint
// PATCH /:id/vincular-odp (crm.controller.ts) usado desde LeadDetalleModal.tsx.
import sequelize from '../config/database';
import { Lead, ODP, LeadEvento } from '../models';

const ADMIN_USER_ID = 1; // Administrador — usuario atribuido a esta correccion de datos
const LEAD_ID = 1360;
const NUMERO_ODP = 'ODP-24142';

async function run() {
  await sequelize.authenticate();
  const t = await sequelize.transaction();

  try {
    const lead = await Lead.findByPk(LEAD_ID, { transaction: t });
    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, transaction: t });

    if (!lead || !odp) {
      console.log(`SALTADO: no se encontro el lead ${LEAD_ID} o ${NUMERO_ODP}`);
      await t.rollback();
      return;
    }

    if (lead.getDataValue('estado_crm') !== 'APROBADO') {
      console.log(`SALTADO: lead ${LEAD_ID} no esta en estado APROBADO (actual: ${lead.getDataValue('estado_crm')})`);
      await t.rollback();
      return;
    }

    if (lead.getDataValue('odp_id')) {
      console.log(`SALTADO: lead ${LEAD_ID} ya tiene odp_id=${lead.getDataValue('odp_id')}`);
      await t.rollback();
      return;
    }

    const odpId = odp.getDataValue('id');

    await lead.update({ odp_id: odpId }, { transaction: t });

    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `Lead vinculado a ODP #${odpId}.`,
      lead_id: LEAD_ID,
      creado_por: ADMIN_USER_ID,
    }, { transaction: t });

    await t.commit();
    console.log(`VINCULADO: lead ${LEAD_ID} -> ${NUMERO_ODP} (odp_id=${odpId})`);
  } catch (err) {
    await t.rollback();
    console.error('ERROR:', err);
  } finally {
    await sequelize.close();
  }
}

run();
