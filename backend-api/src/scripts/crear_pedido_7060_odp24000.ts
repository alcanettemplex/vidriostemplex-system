import { PedidoPV, ODP, ODPItem, Usuario, sequelize } from '../models';

const ODP_ID = 217;              // ODP-24000
const NUMERO = '7060';
const PROVEEDOR = 'Vitelsa';

// 3 cristales de la imagen
const VIDRIOS = [
  { ancho_mm: 737, alto_mm: 2480, pulidos: '2', pulidos_h: '2', perforaciones: 0, boquetes: 0, cantidad: 1 },
  { ancho_mm: 150, alto_mm: 2480, pulidos: '2', pulidos_h: '2', perforaciones: 0, boquetes: 0, cantidad: 1 },
  { ancho_mm: 773, alto_mm: 2480, pulidos: '2', pulidos_h: '2', perforaciones: 0, boquetes: 0, cantidad: 1 },
];

const BASE_ITEM = {
  odp_id: ODP_ID,
  color: 'Incoloro',
  espesor: '8',
  tipo_vidrio: null,
  pelicula: false,
  matizado: false,
  carton: false,
  huacal: false,
  verificacion_prod: false,
  prod: 'PV',
  descuentos: null,
  otros: null,
};

(async () => {
  const t = await sequelize.transaction();
  try {
    const odp = await ODP.findByPk(ODP_ID, { transaction: t });
    if (!odp) throw new Error(`No existe la ODP con id ${ODP_ID}`);
    console.log(`ODP: ${odp.getDataValue('numero_odp')} — Estado: ${odp.getDataValue('estado_produccion')}`);

    // Buscar admin user para CREADO_POR
    const adminUser = await Usuario.findOne({ where: { rol: 'admin' }, transaction: t });
    const creadoPor = adminUser ? adminUser.getDataValue('id') : 30;

    // Verificar si ya existe el pedido 7060
    const yaExiste = await PedidoPV.findOne({ where: { numero_pedido: NUMERO }, transaction: t });
    if (yaExiste) {
      console.log(`El pedido ${NUMERO} ya existe con ID ${yaExiste.getDataValue('id')}`);
      await t.rollback();
      return;
    }

    // Metraje total
    const metraje = VIDRIOS.reduce((acc, v) => acc + (v.ancho_mm * v.alto_mm * v.cantidad) / 1_000_000, 0);

    const pedido = await PedidoPV.create({
      numero_pedido: NUMERO,
      numero_base: parseInt(NUMERO, 10),
      sufijo: null,
      odp_id: ODP_ID,
      proveedor: PROVEEDOR,
      creado_por: creadoPor,
      estado: 'PENDIENTE',
      origen: 'SISTEMA',
      espesor_vidrio: '8',
      metraje_venta: Number(metraje.toFixed(3)),
      observaciones: 'Pedido PV montado para ODP-24000',
    } as any, { transaction: t });

    const pedidoId = pedido.getDataValue('id');
    console.log(`Pedido PV ${NUMERO} creado con éxito (ID: ${pedidoId})`);

    for (const v of VIDRIOS) {
      const item = await ODPItem.create({
        ...BASE_ITEM,
        ...v,
        pedido_pv_id: pedidoId,
      } as any, { transaction: t });
      console.log(`  -> Ítem creado ID ${item.getDataValue('id')}: ${v.ancho_mm}x${v.alto_mm} mm (Cant: ${v.cantidad})`);
    }

    await t.commit();
    console.log(`\n¡PROCESO COMPLETADO! Pedido PV #${NUMERO} y sus 3 cristales fueron creados y asignados correctamente.`);
  } catch (error: any) {
    await t.rollback();
    console.error('Error al crear pedido PV:', error);
  } finally {
    await sequelize.close();
  }
})();
