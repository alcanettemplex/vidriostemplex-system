import { sequelize, PedidoPV } from '../models';

async function main() {
  const pedido = await PedidoPV.findByPk(438);
  if (!pedido) {
    console.log('PedidoPV 438 no encontrado');
    return;
  }
  const antes = pedido.toJSON() as any;
  console.log('Antes:', { id: antes.id, numero_pedido: antes.numero_pedido, estado: antes.estado, odp_id: antes.odp_id });

  await pedido.update({ estado: 'PENDIENTE' });

  console.log('Después: estado =', pedido.getDataValue('estado'));
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
