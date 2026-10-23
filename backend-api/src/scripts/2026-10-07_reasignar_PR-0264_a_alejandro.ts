/**
 * 2026-10-07 — PR-0264 (JUAN ESTEBAN DUQUE): reasignar el prospecto de
 * Bryam Arrubla (id 12) a Alejandro Ardila (id 13), por orden del usuario.
 *
 * No hay forma de hacerlo desde la UI: `updateProspecto` no acepta `asesor_id`.
 * La toma de medidas vinculada no tiene dueño propio y sigue al prospecto; no
 * hay leads ni capturas de cotización ligadas (verificado antes de ejecutar).
 *
 * Guardas: aborta si el prospecto ya no está a nombre de Bryam o dejó de estar
 * `en_gestion`. Se usa .update() sobre la instancia (no bulk) dentro de
 * requestContext para que quede en auditoria_log atribuido a ROOT y sea
 * revertible desde el panel ROOT.
 *
 * Por defecto es simulación; escribe solo con --aplicar:
 *   npx ts-node src/scripts/2026-10-07_reasignar_PR-0264_a_alejandro.ts --aplicar
 */
import { Prospecto, Usuario, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_PROSPECTO = 'PR-0264';
const ASESOR_ACTUAL_ID = 12; // Bryam Arrubla
const ASESOR_NUEVO_ID = 13; // Alejandro Ardila
const USUARIO_ID = 30; // ROOT — corrección administrativa
const APLICAR = process.argv.includes('--aplicar');

(async () => {
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script reasignación prospecto)', ip: null },
      async () => {
        const prospecto = (await Prospecto.findOne({ where: { numero_prospecto: NUMERO_PROSPECTO } })) as any;
        if (!prospecto) {
          console.error(`No se encontró ${NUMERO_PROSPECTO}. Nada que hacer.`);
          return;
        }

        const asesorId = Number(prospecto.getDataValue('asesor_id'));
        const estado = prospecto.getDataValue('estado');
        console.log(`${NUMERO_PROSPECTO} (id ${prospecto.getDataValue('id')}) — asesor_id=${asesorId}, estado=${estado}`);

        if (asesorId === ASESOR_NUEVO_ID) {
          console.log('Ya está a nombre del asesor nuevo. Nada que hacer.');
          return;
        }
        if (asesorId !== ASESOR_ACTUAL_ID || estado !== 'en_gestion') {
          console.error('El prospecto cambió desde la verificación (asesor o estado). Abortado sin escribir.');
          return;
        }

        const nuevo = (await Usuario.findByPk(ASESOR_NUEVO_ID)) as any;
        if (!nuevo || !nuevo.getDataValue('activo')) {
          console.error(`El usuario ${ASESOR_NUEVO_ID} no existe o está inactivo. Abortado sin escribir.`);
          return;
        }

        console.log(`  → asesor nuevo: ${nuevo.getDataValue('nombre_completo')} (id ${ASESOR_NUEVO_ID})`);
        if (!APLICAR) {
          console.log('Simulación: no se escribió nada. Ejecutar con --aplicar.');
          return;
        }

        await prospecto.update({ asesor_id: ASESOR_NUEVO_ID });
        await prospecto.reload();
        console.log(`Hecho. asesor_id ahora = ${prospecto.getDataValue('asesor_id')}`);
      },
    );
  } catch (e) {
    console.error('Error reasignando el prospecto:', e);
  } finally {
    await sequelize.close();
  }
})();
