import { ODP, Usuario, ODPItem, PedidoPV } from './src/models';
import sequelize from './src/config/database';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  try {
    const odp = await ODP.findOne({
      where: { numero_odp: 'ODP-0002' },
      include: [
        { model: Usuario, as: 'asesor' },
        { model: ODPItem, as: 'items' },
        { model: PedidoPV, as: 'pedidos_pv' }
      ]
    });

    if (!odp) {
      console.log('ODP-0002 no encontrada');
      process.exit(0);
    }

    console.log('CREADOR (Asesor):', odp.getDataValue('asesor')?.getDataValue('nombre_completo'));
    console.log('ITEMS REISTRADOS:', odp.getDataValue('items')?.length);
    console.log('PEDIDOS PV EXISTENTES:', odp.getDataValue('pedidos_pv')?.length);
    console.log('PROVEEDOR VIDRIO EN ODP:', odp.getDataValue('proveedor_vidrio'));

    process.exit(0);
  } catch (error: any) {
    console.error('ERROR:', error?.message);
    process.exit(1);
  }
}
run();
