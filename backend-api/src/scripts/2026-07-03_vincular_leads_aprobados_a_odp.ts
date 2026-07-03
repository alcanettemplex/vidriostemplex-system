// Backfill: vincula leads APROBADO cuya ODP fue creada directamente desde el
// módulo ODP, sin pasar por el panel "Cierre del Lead" del CRM (odp_id/cliente_id
// quedaron en null aunque el negocio ya se cerró). Fuente: cruce manual de
// Prospectos_Aprobados_sin_ODP.xlsx contra la tabla odp por teléfono, verificado
// 2026-07-03. Ver auditoria en conversación — 24 de 26 leads del reporte ya
// tenían una ODP real (18 ENTREGADA); 2 quedan excluidos aquí por conflicto real
// de cliente_id (327: contacto vs razón social; 570: cliente duplicado por
// numero_documento con espacios) y requieren decisión manual, no automatizada.
import sequelize from '../config/database';
import { Lead, ODP, LeadEvento } from '../models';

const ADMIN_USER_ID = 1; // Administrador — usuario atribuido a esta corrección de datos

const pares: Array<{ leadId: number; numeroOdp: string }> = [
  { leadId: 123, numeroOdp: 'ODP-23862' },
  { leadId: 133, numeroOdp: 'ODP-23915' },
  { leadId: 182, numeroOdp: 'ODP-23885' },
  { leadId: 220, numeroOdp: 'ODP-23880' },
  { leadId: 236, numeroOdp: 'ODP-23912' },
  { leadId: 242, numeroOdp: 'ODP-23887' },
  { leadId: 306, numeroOdp: 'ODP-23978' },
  // 327 (ODP-23899) excluido: cliente_id en conflicto real, requiere decisión manual
  { leadId: 338, numeroOdp: 'ODP-23939' },
  { leadId: 350, numeroOdp: 'ODP-23903' },
  { leadId: 482, numeroOdp: 'ODP-23951' },
  { leadId: 563, numeroOdp: 'ODP-23986' },
  // 570 (ODP-23975) excluido: cliente duplicado por numero_documento con espacios
  { leadId: 594, numeroOdp: 'ODP-23989' },
  { leadId: 602, numeroOdp: 'ODP-23992' },
  { leadId: 739, numeroOdp: 'ODP-24009' },
  { leadId: 794, numeroOdp: 'ODP-24067' },
  { leadId: 821, numeroOdp: 'ODP-24014' },
  { leadId: 825, numeroOdp: 'ODP-24016' },
  { leadId: 963, numeroOdp: 'ODP-24055' },
  { leadId: 982, numeroOdp: 'ODP-24082' },
  { leadId: 1076, numeroOdp: 'ODP-24122' },
  { leadId: 1095, numeroOdp: 'ODP-24124' },
  { leadId: 1131, numeroOdp: 'ODP-24123' },
];

async function run() {
  await sequelize.authenticate();
  let vinculados = 0, saltados = 0, conflictos = 0;

  for (const { leadId, numeroOdp } of pares) {
    const t = await sequelize.transaction();
    try {
      const lead = await Lead.findByPk(leadId, { transaction: t });
      const odp = await ODP.findOne({ where: { numero_odp: numeroOdp }, transaction: t });

      if (!lead || !odp) {
        console.log(`SALTADO lead ${leadId}: no se encontro el lead o ${numeroOdp}`);
        await t.rollback(); saltados++; continue;
      }

      const odpId = odp.getDataValue('id');
      const odpClienteId = odp.getDataValue('cliente_id');
      const leadOdpIdActual = lead.getDataValue('odp_id');
      const leadClienteIdActual = lead.getDataValue('cliente_id');

      if (leadOdpIdActual) {
        console.log(`SALTADO lead ${leadId}: ya tiene odp_id=${leadOdpIdActual}`);
        await t.rollback(); saltados++; continue;
      }

      if (leadClienteIdActual && leadClienteIdActual !== odpClienteId) {
        console.log(`CONFLICTO lead ${leadId}: cliente_id actual=${leadClienteIdActual} distinto de odp.cliente_id=${odpClienteId} -- no se toco, revisar manualmente`);
        await t.rollback(); conflictos++; continue;
      }

      await lead.update({
        odp_id: odpId,
        cliente_id: odpClienteId,
        fecha_cierre: lead.getDataValue('fecha_cierre') || new Date(),
        cliente_es_nuevo: leadClienteIdActual ? lead.getDataValue('cliente_es_nuevo') : false,
      }, { transaction: t });

      await LeadEvento.create({
        tipo: 'SEGUIMIENTO',
        detalle_texto: `Vinculacion retroactiva (auditoria de datos 2026-07-03): cliente y ${numeroOdp} ya existian en el sistema, creados directamente desde el modulo ODP sin pasar por el panel de cierre del CRM.`,
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

  console.log(`\nResumen: ${vinculados} vinculados, ${saltados} saltados, ${conflictos} conflictos.`);
  await sequelize.close();
}

run();
