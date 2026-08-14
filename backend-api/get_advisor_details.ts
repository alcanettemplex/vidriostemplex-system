import sequelize from './src/config/database';
import { Usuario, Lead, Prospecto } from './src/models';
import { Op } from 'sequelize';
import fs from 'fs';

async function main() {
  try {
    await sequelize.authenticate();

    const advisors = [13, 15, 74]; // Alejandro (13), Nataly (15), Paola (74)
    
    const results: any = {};

    for (const id of advisors) {
      const user = await Usuario.findByPk(id, { attributes: ['id', 'username', 'nombre_completo'], raw: true });
      const leads = await Lead.findAll({
        where: {
          asesor_id: id,
          estado_crm: {
            [Op.in]: ['APROBADO', 'SEGUIMIENTO', 'COTIZANDO', 'EN_CONTACTO', 'ASIGNADO', 'NUEVO']
          }
        },
        order: [['monto_proyectado_cotizacion', 'DESC'], ['updatedAt', 'DESC']],
        raw: true
      });

      const prospectos = await Prospecto.findAll({
        where: {
          asesor_id: id,
          estado: { [Op.ne]: 'no_aprobado' }
        },
        order: [['fecha_creacion', 'DESC']],
        raw: true
      });

      results[id] = {
        user,
        leads,
        prospectos
      };
    }

    fs.writeFileSync('advisors_report_data.json', JSON.stringify(results, null, 2));
    console.log('DATA WRITTEN TO advisors_report_data.json');
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();
