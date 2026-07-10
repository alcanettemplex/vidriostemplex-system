// Backfill acotado (>= 2026-07-01): sincroniza los leads que quedaron colgados en
// VISITA_TECNICA aunque su prospecto ya se aprobó y generó ODP. Corrige el vacío que
// existía en aprobarProspecto antes del fix del 2026-07-09 (el lead no heredaba
// estado APROBADO ni odp_id, distorsionando la tasa de conversión y el "aprobado sin ODP").
//
// Alcance deliberado: solo prospectos con fecha_gestion >= 2026-07-01 (mes en curso),
// para que el tablero CRM de julio muestre los negocios correctos sin reescribir el
// histórico completo. Idempotente: un lead ya sincronizado se salta.
//
// Ejecutar UNA sola vez:  npx ts-node src/scripts/2026-07-09_reconciliar_leads_prospecto_aprobado.ts
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { Prospecto, Lead, LeadEvento, ODP } from '../models';

const DESDE = '2026-07-01';

async function run() {
  await sequelize.authenticate();
  let reconciliados = 0, saltados = 0, sinLead = 0;

  const prospectos = await Prospecto.findAll({
    where: {
      estado: 'aprobado',
      odp_id: { [Op.ne]: null },
      fecha_gestion: { [Op.gte]: new Date(DESDE) },
    },
  });
  console.log(`Prospectos aprobados con ODP desde ${DESDE}: ${prospectos.length}`);

  for (const p of prospectos) {
    const prospectoId = p.getDataValue('id');
    const odpId = p.getDataValue('odp_id');
    const numeroProspecto = p.getDataValue('numero_prospecto');

    const leads = await Lead.findAll({ where: { prospecto_id: prospectoId } });
    if (leads.length === 0) { sinLead++; continue; }

    const odp = await ODP.findByPk(odpId, { attributes: ['id', 'numero_odp', 'valor_total', 'cliente_id'] });
    const numeroOdp = odp?.getDataValue('numero_odp') ?? `#${odpId}`;
    const valorTotal = odp ? parseFloat(odp.getDataValue('valor_total') || '0') : 0;
    const odpClienteId = odp ? odp.getDataValue('cliente_id') : null;

    for (const lead of leads) {
      const leadId = lead.getDataValue('id');
      const yaOk = lead.getDataValue('estado_crm') === 'APROBADO' && lead.getDataValue('odp_id') === odpId;
      if (yaOk) {
        console.log(`SALTADO lead ${leadId}: ya sincronizado con ${numeroOdp}`);
        saltados++;
        continue;
      }

      const t = await sequelize.transaction();
      try {
        await lead.update({
          estado_crm: 'APROBADO',
          odp_id: odpId,
          cliente_id: lead.getDataValue('cliente_id') || odpClienteId || p.getDataValue('cliente_id'),
          fecha_aprobado: lead.getDataValue('fecha_aprobado') || p.getDataValue('fecha_gestion') || new Date(),
          fecha_cierre: lead.getDataValue('fecha_cierre') || p.getDataValue('fecha_gestion') || new Date(),
          monto_real_venta: valorTotal > 0 ? valorTotal : lead.getDataValue('monto_proyectado_cotizacion'),
        }, { transaction: t });

        await LeadEvento.create({
          tipo: 'CONVERSION',
          detalle_texto: `[Reconciliación 2026-07-09] Prospecto ${numeroProspecto} aprobado → ODP ${numeroOdp} vinculada retroactivamente al lead.`,
          lead_id: leadId,
          creado_por: lead.getDataValue('asesor_id') || lead.getDataValue('asistente_id'),
        }, { transaction: t });

        await t.commit();
        console.log(`RECONCILIADO lead ${leadId} (${lead.getDataValue('nombre')}) → ${numeroOdp}`);
        reconciliados++;
      } catch (err) {
        await t.rollback();
        console.error(`ERROR lead ${leadId}:`, err);
      }
    }
  }

  console.log(`\nResumen: ${reconciliados} reconciliados, ${saltados} ya estaban OK, ${sinLead} prospectos sin lead de origen.`);
  await sequelize.close();
}

run();
