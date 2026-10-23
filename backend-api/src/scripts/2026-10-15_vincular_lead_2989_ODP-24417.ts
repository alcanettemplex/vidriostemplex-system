/**
 * 2026-10-15 — Vincular el lead #2989 (EDWIN POSADA, 300 2030795) a ODP-24417
 * (id 679, cliente 1737 EDWIN POSADA GIRALDO), por orden del usuario.
 *
 * Desde la UI no se podía: el paso "Vincular ODP" de LeadDetalleModal exige
 * `cliente_id`, y el lead quedó APROBADO sin pasar por "Convertir a cliente".
 * Se asignan `odp_id` y `cliente_id` (este último cuenta el lead como
 * convertido en las métricas del CRM). Los asesores no se tocan: el lead es de
 * Nataly (15) y la ODP de Bryam (12) — decisión del usuario.
 *
 * Guardas: aborta si el lead dejó de estar APROBADO, ya tiene otra ODP u otro
 * cliente, o si la ODP cambió de cliente. .update() sobre la instancia dentro
 * de requestContext → queda en auditoria_log atribuido a ROOT y es revertible.
 * Sin socket: importar ../server levantaría otro servidor; el CRM se ve al recargar.
 *
 * Por defecto es simulación; escribe solo con --aplicar:
 *   npx ts-node src/scripts/2026-10-15_vincular_lead_2989_ODP-24417.ts --aplicar
 */
import { Lead, LeadEvento, ODP, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const LEAD_ID = 2989;
const NUMERO_ODP = 'ODP-24417';
const CLIENTE_ID = 1737; // EDWIN POSADA GIRALDO
const USUARIO_ID = 30; // ROOT — corrección administrativa
const APLICAR = process.argv.includes('--aplicar');

(async () => {
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script vínculo lead–ODP)', ip: null },
      async () => {
        const lead = (await Lead.findByPk(LEAD_ID)) as any;
        const odp = (await ODP.findOne({ where: { numero_odp: NUMERO_ODP } })) as any;
        if (!lead || !odp) {
          console.error(`No se encontró el lead ${LEAD_ID} o ${NUMERO_ODP}. Nada que hacer.`);
          return;
        }

        const odpId = Number(odp.getDataValue('id'));
        const leadOdp = lead.getDataValue('odp_id');
        const leadCliente = lead.getDataValue('cliente_id');
        console.log(`Lead ${LEAD_ID} "${lead.getDataValue('nombre')}" — estado=${lead.getDataValue('estado_crm')}, odp_id=${leadOdp}, cliente_id=${leadCliente}`);
        console.log(`${NUMERO_ODP} (id ${odpId}) — cliente_id=${odp.getDataValue('cliente_id')}`);

        if (Number(leadOdp) === odpId && Number(leadCliente) === CLIENTE_ID) {
          console.log('Ya está vinculado. Nada que hacer.');
          return;
        }
        if (
          lead.getDataValue('estado_crm') !== 'APROBADO' ||
          (leadOdp && Number(leadOdp) !== odpId) ||
          (leadCliente && Number(leadCliente) !== CLIENTE_ID) ||
          Number(odp.getDataValue('cliente_id')) !== CLIENTE_ID
        ) {
          console.error('El lead o la ODP cambiaron desde la verificación. Abortado sin escribir.');
          return;
        }

        if (!APLICAR) {
          console.log(`Simulación: se asignaría odp_id=${odpId}, cliente_id=${CLIENTE_ID}. Ejecutar con --aplicar.`);
          return;
        }

        await sequelize.transaction(async (t) => {
          await lead.update({ odp_id: odpId, cliente_id: CLIENTE_ID }, { transaction: t });
          await LeadEvento.create(
            {
              tipo: 'SEGUIMIENTO',
              detalle_texto: `Lead vinculado a ODP #${odpId}.`,
              lead_id: LEAD_ID,
              creado_por: USUARIO_ID,
            },
            { transaction: t },
          );
        });
        await lead.reload();
        console.log(`Hecho. odp_id=${lead.getDataValue('odp_id')}, cliente_id=${lead.getDataValue('cliente_id')}`);
      },
    );
  } catch (e) {
    console.error('Error vinculando el lead a la ODP:', e);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
})();
