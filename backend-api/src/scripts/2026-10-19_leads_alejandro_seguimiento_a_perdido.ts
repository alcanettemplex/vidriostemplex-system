/**
 * 2026-10-19 — Leads de Alejandro Ardila (id 13) en SEGUIMIENTO → PERDIDO por no contestar,
 * por orden del usuario. Se excluye a propósito el lead 3177 (Carlos Mora): entró a
 * seguimiento el 2026-10-17 y el usuario decidió dejarlo.
 *
 * Hace por cada lead lo mismo que `updateLeadStatus` (crm.controller.ts) al pasar a
 * PERDIDO: estado, motivo y `fecha_perdido`, más el evento CAMBIO_ESTADO en la bitácora
 * (cuyo hook actualiza `ultima_actividad`). Ninguno está ligado a ODP, prospecto, cliente
 * ni cotización del Cotizador (verificado antes de ejecutar).
 *
 * Guardas: lista cerrada de ids; un lead que ya no esté a nombre de Alejandro o ya no esté
 * en SEGUIMIENTO se salta y se informa. Todo en una transacción. Se usa .update() sobre la
 * instancia (no bulk) dentro de requestContext para que quede en auditoria_log atribuido a
 * ROOT y sea revertible desde el panel ROOT.
 *
 * Por defecto es simulación; escribe solo con --aplicar:
 *   npx ts-node src/scripts/2026-10-19_leads_alejandro_seguimiento_a_perdido.ts --aplicar
 */
import { QueryTypes } from 'sequelize';
import { Lead, LeadEvento, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const ASESOR_ID = 13; // Alejandro Ardila
const USUARIO_ID = 30; // ROOT — cierre administrativo
const MOTIVO = 'No respondió (ghosting total)';
const LEAD_IDS = [2103, 2240, 2349, 2393, 2535, 2531, 2651, 2700, 2695, 2164, 2716, 2739, 2645];
const APLICAR = process.argv.includes('--aplicar');
/** Los hooks de auditoría escriben sin esperar: se les da tiempo antes de cerrar la conexión. */
const ESPERA_AUDITORIA_MS = 4000;

(async () => {
  const inicio = new Date();
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script leads Alejandro a perdido)', ip: null },
      async () => {
        const leads = (await Lead.findAll({ where: { id: LEAD_IDS }, order: [['id', 'ASC']] })) as any[];
        const aptos = leads.filter(
          (l) => Number(l.getDataValue('asesor_id')) === ASESOR_ID && l.getDataValue('estado_crm') === 'SEGUIMIENTO',
        );
        for (const id of LEAD_IDS) {
          const l = leads.find((x) => x.getDataValue('id') === id);
          const marca = !l ? 'NO EXISTE — se salta' : aptos.includes(l) ? 'se pasa a PERDIDO' : `se salta (asesor ${l.getDataValue('asesor_id')}, estado ${l.getDataValue('estado_crm')})`;
          console.log(`  ${id}  ${(l?.getDataValue('nombre') ?? '').trim().padEnd(45).slice(0, 45)}  ${marca}`);
        }
        console.log(`\n${aptos.length} de ${LEAD_IDS.length} leads se pasan a PERDIDO con motivo «${MOTIVO}».`);
        if (!APLICAR) {
          console.log('Simulación: no se escribió nada. Ejecutar con --aplicar.');
          return;
        }
        if (!aptos.length) return;

        await sequelize.transaction(async (t) => {
          for (const lead of aptos) {
            await lead.update({ estado_crm: 'PERDIDO', motivo_perdida: MOTIVO, fecha_perdido: new Date() }, { transaction: t });
            await LeadEvento.create(
              {
                tipo: 'CAMBIO_ESTADO',
                detalle_texto: 'Movido de SEGUIMIENTO a PERDIDO (cierre masivo por no contestar, orden de gerencia 2026-10-19)',
                lead_id: lead.getDataValue('id'),
                creado_por: USUARIO_ID,
              },
              { transaction: t },
            );
          }
        });

        const [{ perdidos }] = await sequelize.query<{ perdidos: string }>(
          `SELECT count(*) AS perdidos FROM leads WHERE id IN (:ids) AND estado_crm = 'PERDIDO' AND motivo_perdida = :motivo`,
          { replacements: { ids: aptos.map((l) => l.getDataValue('id')), motivo: MOTIVO }, type: QueryTypes.SELECT },
        );
        console.log(`Hecho. Leads en PERDIDO con el motivo: ${perdidos}/${aptos.length}.`);

        await new Promise((r) => setTimeout(r, ESPERA_AUDITORIA_MS));
        const [{ auditados }] = await sequelize.query<{ auditados: string }>(
          `SELECT count(DISTINCT registro_id) AS auditados FROM auditoria_log
           WHERE tabla = 'leads' AND operacion = 'UPDATE' AND registro_id IN (:ids) AND fecha >= :inicio`,
          { replacements: { ids: aptos.map((l) => String(l.getDataValue('id'))), inicio }, type: QueryTypes.SELECT },
        ).catch((e) => { console.error('No se pudo verificar la auditoría:', e.message); return [{ auditados: '?' }]; });
        console.log(`Auditoría registrada para ${auditados}/${aptos.length} leads.`);
      },
    );
  } catch (e) {
    console.error('Error pasando los leads a PERDIDO (la transacción se revirtió):', e);
  } finally {
    await sequelize.close();
  }
})();
