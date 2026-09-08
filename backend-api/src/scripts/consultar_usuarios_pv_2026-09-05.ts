import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { Usuario, sequelize } from '../models';

(async () => {
  try {
    const usuarios = await Usuario.findAll({
      where: { rol: ['root', 'admin', 'compras', 'jefe_produccion'] },
      attributes: ['id', 'nombre_completo', 'email', 'rol', 'puede_gestionar_pv', 'activo'],
    });
    console.log(usuarios.map(u => u.toJSON()));
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();
