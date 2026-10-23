/**
 * 2026-10-23 — ODP-24456 (SONAKY GRUP S.A.S): quitar el vidrio #2193 (2 × 900 × 2183), por
 * orden del usuario.
 *
 * El formulario no podía: al quitar el ÚLTIMO vidrio de la lista, la animación de salida
 * dejaba un vidrio fantasma (`{ color }`) que no pasaba la validación y el botón no hacía nada,
 * sin mensaje. Corregido en ODPForm.tsx el mismo día; este script resuelve el caso puntual.
 *
 * Guardas: solo borra si el vidrio sigue en la ODP-24456, libre (sin Pedido PV y con
 * `estado_compra = 'pendiente'`) y sin órdenes de compra que lo referencien. Se usa
 * .destroy() sobre la instancia dentro de requestContext para que quede en auditoria_log
 * atribuido a ROOT y sea revertible desde el panel ROOT.
 *
 * Por defecto es simulación; escribe solo con --aplicar:
 *   npx ts-node src/scripts/2026-10-23_quitar_vidrio_2193_odp24456.ts --aplicar
 */
import { ODP, ODPItem, ODCItem, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24456';
const ITEM_ID = 2193;
const USUARIO_ID = 30; // ROOT — corrección administrativa
const APLICAR = process.argv.includes('--aplicar');

(async () => {
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script quitar vidrio ODP-24456)', ip: null },
      async () => {
        const odp = (await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, attributes: ['id'] })) as any;
        const item = (await ODPItem.findByPk(ITEM_ID)) as any;
        if (!odp || !item) {
          console.error('No se encontró la ODP o el vidrio. Nada que hacer.');
          return;
        }
        const desc = `#${ITEM_ID}: ${item.getDataValue('cantidad')} × ${item.getDataValue('ancho_mm')} × ${item.getDataValue('alto_mm')}`;
        console.log(`${NUMERO_ODP} (id ${odp.getDataValue('id')}) — vidrio ${desc}`);

        if (Number(item.getDataValue('odp_id')) !== Number(odp.getDataValue('id'))) {
          console.error('El vidrio no pertenece a esa ODP. Abortado sin escribir.');
          return;
        }
        if (item.getDataValue('pedido_pv_id') !== null || item.getDataValue('estado_compra') !== 'pendiente') {
          console.error('El vidrio ya está en un Pedido PV o en Compras. Abortado sin escribir.');
          return;
        }
        const enOdc = await ODCItem.count({ where: { odp_item_id: ITEM_ID } });
        if (enOdc > 0) {
          console.error('Una orden de compra referencia el vidrio. Abortado sin escribir.');
          return;
        }

        if (!APLICAR) {
          console.log('Simulación: el vidrio está libre y se puede quitar. Ejecutar con --aplicar.');
          return;
        }
        await item.destroy();
        const quedan = await ODPItem.count({ where: { odp_id: odp.getDataValue('id') } });
        console.log(`Hecho. El vidrio ${desc} se quitó; la ODP queda con ${quedan} vidrio(s).`);
      },
    );
  } catch (e) {
    console.error('Error quitando el vidrio:', e);
  } finally {
    await sequelize.close();
  }
})();
