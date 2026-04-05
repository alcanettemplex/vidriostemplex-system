import { ODP, Usuario, ODPItem, PedidoPV } from './src/models';
import sequelize from './src/config/database';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function fixODP() {
  try {
    const odp = await ODP.findOne({
      where: { numero_odp: 'ODP-0002' }
    });

    if (!odp) {
      console.log('ODP-0002 no encontrada');
      process.exit(0);
    }

    const proveedor = odp.getDataValue('proveedor_vidrio');
    const odp_id = odp.getDataValue('id');
    const userId = odp.getDataValue('asesor_id'); // We'll just use the creator

    if (!proveedor) {
      console.log('ODP-0002 no tiene proveedor_vidrio asignado');
      process.exit(0);
    }

    const count = await PedidoPV.count({ where: { odp_id } });
    if (count > 0) {
      console.log('ODP-0002 ya tiene un PedidoPV.');
      process.exit(0);
    }

    const ultimoPV = await PedidoPV.findOne({
      order: [['numero_base', 'DESC']],
      attributes: ['numero_base'],
    });

    const numero_base = ultimoPV ? (ultimoPV.getDataValue('numero_base') as number) + 1 : 6733;
    const numero_pedido = String(numero_base);

    await PedidoPV.create({
      odp_id: odp_id,
      proveedor: proveedor,
      numero_pedido,
      numero_base,
      sufijo: null,
      estado: 'PENDIENTE',
      origen: 'SISTEMA',
      creado_por: userId,
    });

    await ODP.update(
      { numero_pedido_proveedor: numero_pedido },
      { where: { id: odp_id } }
    );

    console.log(`Fix listo! PedidoPV ${numero_pedido} generado correctamente e inyectado a ODP-0002`);
    process.exit(0);
  } catch (error: any) {
    console.error('ERROR:', error?.message);
    process.exit(1);
  }
}
fixODP();
