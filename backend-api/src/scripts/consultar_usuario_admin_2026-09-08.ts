import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { Usuario, sequelize } from '../models';
import { Op } from 'sequelize';

(async () => {
  try {
    const usuarios = await Usuario.findAll({
      where: {
        [Op.or]: [
          { rol: 'admin' },
          { nombre_completo: { [Op.iLike]: '%admin%' } },
        ],
      },
      attributes: ['id', 'nombre_completo', 'email', 'rol', 'activo'],
    });
    console.log(usuarios.map(u => u.toJSON()));
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();
