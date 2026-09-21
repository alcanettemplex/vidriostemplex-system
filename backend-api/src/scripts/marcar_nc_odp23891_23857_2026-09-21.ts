// Marca ODP-23891 y ODP-23857 como No Conformidad (es_no_conformidad = true).
// No tienen ODP padre ni flujo formal de NC: se elaboraron mal en su momento y el
// usuario pidió marcarlas directamente para que dejen de contar como pendientes de
// factura en Contabilidad. Patrón ya contemplado en odp.controller.ts (createODP,
// comentario "Reposición / No Conformidad creada directamente... cuando la ODP
// origen no existe en el sistema"). estado_caja ya está en CANCELADO, no cambia.
//
// Se usa odp.update() de instancia (no update masivo) envuelto en requestContext
// para que dispare los hooks de auditoría de models/index.ts con un actor real.
import sequelize from '../config/database';
import { ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMEROS_ODP = ['ODP-23891', 'ODP-23857'];
const ACTOR = { userId: 30, userName: 'ROOT', ip: null }; // usuario ROOT

async function marcarNC() {
  try {
    await sequelize.authenticate();

    await requestContext.run(ACTOR, async () => {
      for (const numero of NUMEROS_ODP) {
        const odp: any = await ODP.findOne({ where: { numero_odp: numero } });
        if (!odp) {
          console.error(`No encontrada: ${numero}`);
          continue;
        }
        if (odp.getDataValue('es_no_conformidad')) {
          console.log(`${numero} ya estaba marcada como NC, se omite.`);
          continue;
        }
        await odp.update({ es_no_conformidad: true });
        console.log(`${numero} (id=${odp.getDataValue('id')}) marcada como NC.`);
      }
    });

    console.log('Listo.');
  } catch (error) {
    console.error('Error al marcar NC:', error);
  } finally {
    await sequelize.close();
  }
}

marcarNC();
