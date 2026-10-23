/**
 * 2026-10-23 — Reasignar las 16 ODP creadas por Alejandro Ardila (id 13) desde el
 * 01-oct-2026, por orden del usuario:
 *   - 15 ODP → Juan Diego Cataño (id 14)
 *   - ODP-24467 → Paola Gonzalez (id 74)
 * Y los 3 prospectos de esas ODP (PR-0264, PR-0268, PR-0282), también de Alejandro,
 * → Juan Diego Cataño, para que prospecto y ODP queden con el mismo asesor (decisión
 * del usuario).
 *
 * Verificado antes de ejecutar: ninguna de las 16 tiene leads ni cotizaciones del
 * Cotizador vinculados. 12 tienen Pedido PV: el pedido no guarda asesor
 * (`asesor_iniciales` en null), así que un Excel o impreso que se vuelva a sacar
 * mostrará las iniciales del asesor nuevo en «OBRA».
 *
 * Guardas: cada registro se cambia solo si sigue a nombre de Alejandro; si no, se salta
 * y se avisa. Todo en una transacción, con .update() sobre la instancia (no bulk) dentro
 * de requestContext para que quede en auditoria_log atribuido a ROOT y sea revertible
 * desde el panel ROOT.
 *
 * Por defecto es simulación; escribe solo con --aplicar:
 *   npx ts-node src/scripts/2026-10-23_reasignar_odps_alejandro_octubre.ts --aplicar
 */
import { ODP, Prospecto, Usuario, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const ASESOR_ACTUAL_ID = 13; // Alejandro Ardila
const JUAN_DIEGO_ID = 14; // Juan Diego Cataño
const PAOLA_ID = 74; // Paola Gonzalez
const USUARIO_ID = 30; // ROOT — corrección administrativa
const APLICAR = process.argv.includes('--aplicar');

const ODPS: Record<string, number> = {
  'ODP-24396': JUAN_DIEGO_ID,
  'ODP-24400': JUAN_DIEGO_ID,
  'ODP-24410': JUAN_DIEGO_ID,
  'ODP-24411': JUAN_DIEGO_ID,
  'ODP-24414': JUAN_DIEGO_ID,
  'ODP-24427': JUAN_DIEGO_ID,
  'ODP-24428': JUAN_DIEGO_ID,
  'ODP-24430': JUAN_DIEGO_ID,
  'ODP-24433': JUAN_DIEGO_ID,
  'ODP-24434': JUAN_DIEGO_ID,
  'ODP-24436': JUAN_DIEGO_ID,
  'G-0025': JUAN_DIEGO_ID,
  'ODP-24447': JUAN_DIEGO_ID,
  'ODP-24448': JUAN_DIEGO_ID,
  'ODP-24466': JUAN_DIEGO_ID,
  'ODP-24467': PAOLA_ID,
};
const PROSPECTOS: Record<string, number> = {
  'PR-0264': JUAN_DIEGO_ID, // ODP-24410
  'PR-0268': JUAN_DIEGO_ID, // ODP-24428
  'PR-0282': JUAN_DIEGO_ID, // ODP-24447
};

(async () => {
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script reasignación ODP octubre)', ip: null },
      async () => {
        for (const id of [JUAN_DIEGO_ID, PAOLA_ID]) {
          const u = (await Usuario.findByPk(id, { attributes: ['id', 'nombre_completo', 'activo'] })) as any;
          if (!u || !u.getDataValue('activo')) {
            console.error(`El usuario ${id} no existe o está inactivo. Abortado sin escribir.`);
            return;
          }
          console.log(`Asesor nuevo: ${u.getDataValue('nombre_completo')} (id ${id})`);
        }

        let cambios = 0;
        let saltados = 0;
        await sequelize.transaction(async (transaction) => {
          for (const [numero, nuevo] of Object.entries(ODPS)) {
            const odp = (await ODP.findOne({ where: { numero_odp: numero }, transaction })) as any;
            if (!odp) { console.warn(`  ! ${numero}: no existe. Saltado.`); saltados++; continue; }
            const actual = Number(odp.getDataValue('asesor_id'));
            if (actual === nuevo) { console.log(`  = ${numero}: ya está a nombre del asesor nuevo.`); continue; }
            if (actual !== ASESOR_ACTUAL_ID) { console.warn(`  ! ${numero}: está a nombre del usuario ${actual}, no de Alejandro. Saltado.`); saltados++; continue; }
            console.log(`  → ${numero} (id ${odp.getDataValue('id')}): ${actual} → ${nuevo}`);
            if (APLICAR) await odp.update({ asesor_id: nuevo }, { transaction });
            cambios++;
          }
          for (const [numero, nuevo] of Object.entries(PROSPECTOS)) {
            const p = (await Prospecto.findOne({ where: { numero_prospecto: numero }, transaction })) as any;
            if (!p) { console.warn(`  ! ${numero}: no existe. Saltado.`); saltados++; continue; }
            const actual = Number(p.getDataValue('asesor_id'));
            if (actual === nuevo) { console.log(`  = ${numero}: ya está a nombre del asesor nuevo.`); continue; }
            if (actual !== ASESOR_ACTUAL_ID) { console.warn(`  ! ${numero}: está a nombre del usuario ${actual}, no de Alejandro. Saltado.`); saltados++; continue; }
            console.log(`  → ${numero} (id ${p.getDataValue('id')}): ${actual} → ${nuevo}`);
            if (APLICAR) await p.update({ asesor_id: nuevo }, { transaction });
            cambios++;
          }
        });

        console.log(`${APLICAR ? 'Aplicado' : 'Simulación (no se escribió nada; ejecutar con --aplicar)'}: ${cambios} cambio(s), ${saltados} saltado(s).`);
      },
    );
  } catch (e) {
    console.error('Error reasignando las ODP (la transacción se deshizo, no se escribió nada):', e);
  } finally {
    await sequelize.close();
  }
})();
