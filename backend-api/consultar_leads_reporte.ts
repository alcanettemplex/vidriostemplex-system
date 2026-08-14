import sequelize from './src/config/database';
import { Usuario, Lead } from './src/models';
import { Op } from 'sequelize';

export async function obtenerReporteAsesores() {
  await sequelize.authenticate();

  const asesores = await Usuario.findAll({
    where: {
      activo: true,
      [Op.or]: [
        { nombre_completo: { [Op.iLike]: '%alejandro%' } },
        { nombre_completo: { [Op.iLike]: '%paola%' } },
        { nombre_completo: { [Op.iLike]: '%nataly%' } },
      ],
    },
    attributes: ['id', 'nombre_completo', 'email'],
    raw: true,
  });

  const asesorIds = asesores.map((a: any) => a.id);

  const leads = await Lead.findAll({
    where: {
      asesor_id: { [Op.in]: asesorIds },
      estado_crm: {
        [Op.in]: ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA']
      }
    },
    order: [['updatedAt', 'DESC']],
    raw: true,
  });

  return { asesores, leads };
}

async function run() {
  try {
    const { asesores, leads } = await obtenerReporteAsesores();
    console.log(JSON.stringify({ asesores, leads }, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}
