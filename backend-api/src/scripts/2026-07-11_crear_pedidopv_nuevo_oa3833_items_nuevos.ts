import { sequelize, PedidoPV, ODPItem, ODP } from '../models';

const ODP_ID = 328; // OA-3833
const ITEM_IDS = [1541, 1542, 1543, 1544]; // 1 ESP + 3 PV agregados el 2026-07-11

async function main() {
  const t = await sequelize.transaction();
  try {
    const odp = await ODP.findByPk(ODP_ID, { transaction: t });
    if (!odp) throw new Error('ODP no encontrada');
    const proveedor = odp.getDataValue('proveedor_vidrio') as string;

    const itemsValidos = await ODPItem.count({ where: { id: ITEM_IDS, odp_id: ODP_ID }, transaction: t });
    if (itemsValidos !== ITEM_IDS.length) throw new Error('Alguno de los ítems no pertenece a la ODP esperada');

    const yaAsignados = await ODPItem.findAll({ where: { id: ITEM_IDS }, attributes: ['id', 'pedido_pv_id'], transaction: t });
    const conflicto = yaAsignados.find((it: any) => it.getDataValue('pedido_pv_id') !== null);
    if (conflicto) throw new Error(`Ítem ${conflicto.getDataValue('id')} ya tiene pedido_pv_id asignado — abortando`);

    const ultimoPV = await PedidoPV.findOne({ order: [['numero_base', 'DESC']], attributes: ['numero_base'], transaction: t });
    const numero_base = ultimoPV ? (ultimoPV.getDataValue('numero_base') as number) + 1 : 6733;
    const numero_pedido = String(numero_base);

    const nuevoPV = await PedidoPV.create({
      odp_id: ODP_ID,
      proveedor,
      numero_pedido,
      numero_base,
      sufijo: null,
      estado: 'PENDIENTE',
      origen: 'SISTEMA',
      creado_por: null,
    }, { transaction: t });

    await ODPItem.update(
      { pedido_pv_id: nuevoPV.getDataValue('id') },
      { where: { id: ITEM_IDS }, transaction: t }
    );

    await t.commit();
    console.log('PedidoPV creado:', { id: nuevoPV.getDataValue('id'), numero_pedido, odp_id: ODP_ID });
    console.log('Ítems asignados:', ITEM_IDS);
  } catch (e) {
    await t.rollback();
    throw e;
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
