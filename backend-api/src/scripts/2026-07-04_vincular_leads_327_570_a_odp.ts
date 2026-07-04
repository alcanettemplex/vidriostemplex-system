// Backfill puntual: cierra los 2 casos que el script 2026-07-03_vincular_leads_aprobados_a_odp.ts
// dejó excluidos a proposito por conflicto real de cliente_id (requeria decision manual).
// Confirmado con el usuario en conversacion 2026-07-04:
//  - Lead 327 (LAURA ARROYAVE - LITIGIO VIRTUAL): la ODP-23899 se facturo a nombre de
//    LITIGIOVIRTUAL.COM S.A.S. (cliente_id 1498) por solicitud del cliente. El cliente_id
//    que tenia el lead (1533, LAURA CARDONA VARELA) es una entidad real y separada -- tiene
//    su propia ODP-23949 -- por eso no se toca.
//  - Lead 570 (YURI GONZALEZ): la ODP-23975 quedo bajo el cliente_id 1542 (YURY GONZALEZ
//    ARRIETA, nombre completo) porque asi se digito al crearla. El cliente_id que tenia el
//    lead (1539) es un duplicado incompleto sin ninguna ODP asociada; queda huerfano tras
//    este fix, sin borrar (requeriria revision de FKs antes de eliminarlo).
import sequelize from '../config/database';
import { Lead, ODP, LeadEvento } from '../models';

const ADMIN_USER_ID = 1; // Administrador — usuario atribuido a esta correccion de datos

const pares: Array<{ leadId: number; numeroOdp: string }> = [
  { leadId: 327, numeroOdp: 'ODP-23899' },
  { leadId: 570, numeroOdp: 'ODP-23975' },
];

async function run() {
  await sequelize.authenticate();
  let vinculados = 0, saltados = 0;

  for (const { leadId, numeroOdp } of pares) {
    const t = await sequelize.transaction();
    try {
      const lead = await Lead.findByPk(leadId, { transaction: t });
      const odp = await ODP.findOne({ where: { numero_odp: numeroOdp }, transaction: t });

      if (!lead || !odp) {
        console.log(`SALTADO lead ${leadId}: no se encontro el lead o ${numeroOdp}`);
        await t.rollback(); saltados++; continue;
      }

      if (lead.getDataValue('odp_id')) {
        console.log(`SALTADO lead ${leadId}: ya tiene odp_id=${lead.getDataValue('odp_id')}`);
        await t.rollback(); saltados++; continue;
      }

      const odpId = odp.getDataValue('id');
      const odpClienteId = odp.getDataValue('cliente_id');

      await lead.update({
        odp_id: odpId,
        cliente_id: odpClienteId,
        fecha_cierre: lead.getDataValue('fecha_cierre') || new Date(),
      }, { transaction: t });

      await LeadEvento.create({
        tipo: 'SEGUIMIENTO',
        detalle_texto: `Vinculacion retroactiva (decision manual confirmada 2026-07-04): cliente_id en conflicto resuelto -- ${numeroOdp} ya existia, creada directamente desde el modulo ODP sin pasar por el panel de cierre del CRM.`,
        lead_id: leadId,
        creado_por: ADMIN_USER_ID,
      }, { transaction: t });

      await t.commit();
      console.log(`VINCULADO lead ${leadId} -> ${numeroOdp} (odp_id=${odpId}, cliente_id=${odpClienteId})`);
      vinculados++;
    } catch (err) {
      await t.rollback();
      console.error(`ERROR lead ${leadId}:`, err);
    }
  }

  console.log(`\nResumen: ${vinculados} vinculados, ${saltados} saltados.`);
  await sequelize.close();
}

run();
