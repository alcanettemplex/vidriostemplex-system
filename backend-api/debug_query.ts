import { ODP, Usuario, Vehiculo, RutaInstalacion, RutaODP, sequelize, ODPItem, SAP, SAPItem, Cotizacion, TomaMedidas, OrdenCompra, ODCItem, Pago } from './src/models';
import { Op } from 'sequelize';

async function test() {
  try {
    console.log('--- TEST INCLUDES ---');
    const includes = [
      { model: Vehiculo, as: 'vehiculo', attributes: ['id', 'placa', 'tipo'] },
      { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo', 'rol'] },
      { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      {
        model: Usuario, as: 'instaladores',
        attributes: ['id', 'nombre_completo', 'rol'],
        through: { attributes: [] },
      },
      {
        model: RutaODP, as: 'ruta_odps',
        separate: true,
        order: [['orden', 'ASC']],
        include: [
          {
            model: ODP, as: 'odp',
            include: [
              { model: ODPItem, as: 'items' },
              { model: Pago, as: 'pagos' },
              { model: Cotizacion, as: 'cotizaciones' },
              { model: TomaMedidas, as: 'tomas_medidas' },
              { 
                model: SAP, as: 'saps',
                include: [
                  { model: SAPItem, as: 'items' },
                  { 
                    model: OrdenCompra, as: 'ordenes_compra',
                    include: [{ model: ODCItem, as: 'items' }]
                  }
                ]
              },
            ],
          },
        ],
      },
    ];

    console.log('Ejecutando findAll...');
    const result = await RutaInstalacion.findAll({
      where: { estado: { [Op.ne]: 'cancelada' } },
      include: includes,
      limit: 1
    });
    console.log('EXITO:', result.length);
  } catch (err: any) {
    console.error('ERROR DETALLADO:', err);
    if (err.parent) console.error('PARENT ERROR:', err.parent);
  } finally {
    await sequelize.close();
  }
}

test();
