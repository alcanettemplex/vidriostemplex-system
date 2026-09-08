/**
 * Consulta de verificación previa a crear un Pedido PV manual para ODP-24000
 * (proveedor Vitelsa, 3 ítems de vidrio). Solo lectura.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node -r backend-api/node_modules/dotenv/config backend-api/src/scripts/consultar_odp24000_2026-09-05.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { ODP, PedidoPV, ODPItem, sequelize } from '../models';

(async () => {
  try {
    const odp = await ODP.findOne({ where: { numero_odp: 'ODP-24000' } });
    if (!odp) {
      console.log('ODP-24000 no encontrada');
      return;
    }
    const id = odp.getDataValue('id');
    console.log('ODP id:', id);
    console.log('proveedor_vidrio:', odp.getDataValue('proveedor_vidrio'));
    console.log('numero_pedido_proveedor:', odp.getDataValue('numero_pedido_proveedor'));
    console.log('estado_produccion:', odp.getDataValue('estado_produccion'));

    const pedidos = await PedidoPV.findAll({ where: { odp_id: id } });
    console.log('Pedidos PV existentes:', pedidos.map(p => ({
      numero_pedido: p.getDataValue('numero_pedido'),
      proveedor: p.getDataValue('proveedor'),
      estado: p.getDataValue('estado'),
      origen: p.getDataValue('origen'),
    })));

    const items = await ODPItem.findAll({ where: { odp_id: id } });
    console.log('ODPItems existentes:', items.map(i => ({
      id: i.getDataValue('id'),
      item: i.getDataValue('item'),
      color: i.getDataValue('color'),
      ancho: i.getDataValue('ancho_mm'),
      alto: i.getDataValue('alto_mm'),
      pedido_pv_id: i.getDataValue('pedido_pv_id'),
    })));
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();
