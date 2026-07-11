import { sequelize, ODPItem } from '../models';

const ITEMS_CR_YA_EN_ODC_278 = [1530, 1531, 1532, 1533, 1534, 1535, 1536, 1537, 1538, 1539, 1540];
const ITEMS_PV_YA_GESTIONADOS_6937 = [1522, 1523, 1524, 1525, 1526, 1527, 1528, 1529];
const PEDIDO_PV_438 = 438;

async function main() {
  const t = await sequelize.transaction();
  try {
    const [countCR] = await ODPItem.update(
      { estado_compra: 'en_odc' },
      { where: { id: ITEMS_CR_YA_EN_ODC_278, odp_id: 328 }, transaction: t }
    );
    if (countCR !== ITEMS_CR_YA_EN_ODC_278.length) throw new Error(`Se esperaban ${ITEMS_CR_YA_EN_ODC_278.length} CR actualizados, se actualizaron ${countCR}`);

    const [countPV] = await ODPItem.update(
      { pedido_pv_id: PEDIDO_PV_438 },
      { where: { id: ITEMS_PV_YA_GESTIONADOS_6937, odp_id: 328 }, transaction: t }
    );
    if (countPV !== ITEMS_PV_YA_GESTIONADOS_6937.length) throw new Error(`Se esperaban ${ITEMS_PV_YA_GESTIONADOS_6937.length} PV actualizados, se actualizaron ${countPV}`);

    await t.commit();
    console.log('OK — CR actualizados:', countCR, '| PV actualizados:', countPV);
  } catch (e) {
    await t.rollback();
    throw e;
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
