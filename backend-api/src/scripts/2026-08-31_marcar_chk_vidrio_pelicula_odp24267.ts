/**
 * 2026-08-31 — ODP-24267 (STOP SAS): marcar chk_vidrio y chk_pelicula como completados.
 *
 * Contexto: la ODP ya está en LISTO_INSTALAR pero su panel de componentes mostraba
 * 1/3 (solo Herrajes). Los checks de Vidrio y Película quedaron sin marcar y no hay
 * forma de corregirlos desde la UI: la matriz editable del tablero de Producción
 * (`toggleCheck` en ProduccionPage.tsx) solo se renderiza en las tabs "Activas" y
 * "NC/Garantías", que filtran por `activeStates` — una ODP en LISTO_INSTALAR cae en
 * "Pedido a mano"/despacho, donde no existe la matriz. El panel de la ficha
 * (ODPTabProduccion.tsx) es solo lectura.
 *
 * El estado NO se toca: el auto-avance a LISTO_INSTALAR del controlador solo corre
 * para ESTADOS_PRODUCTIVOS y la orden ya está más adelante. Se marcan ambos checks
 * juntos, coherente con la regla de negocio de que película exige vidrio recibido.
 *
 * Se usa .update() sobre la instancia (no bulk) para que disparen los hooks de
 * auditoría, y se corre dentro de requestContext para que el UPDATE quede atribuido
 * a ROOT y no con usuario_id null.
 *
 * Ejecutar una sola vez:
 *   npx ts-node src/scripts/2026-08-31_marcar_chk_vidrio_pelicula_odp24267.ts
 */
import { ODP, ODPItem, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24267';
const USUARIO_ID = 30; // ROOT — corrección administrativa

(async () => {
  try {
    await requestContext.run(
      { userId: USUARIO_ID, userName: 'ROOT (script corrección chk)', ip: null },
      async () => {
        const odp = (await ODP.findOne({ where: { numero_odp: NUMERO_ODP } })) as any;
        if (!odp) {
          console.error(`No se encontró ${NUMERO_ODP}. Nada que hacer.`);
          return;
        }

        const id = odp.getDataValue('id');
        const estado = odp.getDataValue('estado_produccion');
        const chkVidrio = !!odp.getDataValue('chk_vidrio');
        const chkPelicula = !!odp.getDataValue('chk_pelicula');
        const llevaPelicula = !!odp.getDataValue('pelicula');
        const itemCount = await ODPItem.count({ where: { odp_id: id } });

        console.log(`${NUMERO_ODP} (id ${id}) — estado_produccion: ${estado}`);
        console.log(`  chk_vidrio=${chkVidrio}  chk_pelicula=${chkPelicula}`);
        console.log(`  items=${itemCount}  pelicula=${llevaPelicula}`);

        // Chequeos de aplicabilidad — espejo de isColApplicable() del tablero.
        // Marcar un check que no aplica ensuciaría el avance mostrado en la ficha.
        if (itemCount === 0) {
          console.error('ABORTADO: la ODP no tiene ítems cargados, el check de Vidrio no aplica.');
          return;
        }
        if (!llevaPelicula) {
          console.error('ABORTADO: la ODP no está marcada con película, ese check no aplica.');
          return;
        }

        if (chkVidrio && chkPelicula) {
          console.log('Ambos checks ya están marcados. No se modifica nada.');
          return;
        }

        await odp.update({ chk_vidrio: true, chk_pelicula: true });

        console.log(
          `OK — chk_vidrio: ${chkVidrio} → true, chk_pelicula: ${chkPelicula} → true. ` +
          `estado_produccion sin cambios (${estado}).`
        );

        // Los hooks de auditoría son fire-and-forget: dar margen antes de cerrar la conexión.
        await new Promise((r) => setTimeout(r, 2500));
      }
    );
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();
