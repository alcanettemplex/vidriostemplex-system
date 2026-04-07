import { Usuario } from './src/models';
import sequelize from './src/config/database';

async function listAdvisors() {
  try {
    const users = await Usuario.findAll({ 
      where: { rol: 'asesor_comercial' },
      attributes: ['id', 'username', 'nombre_completo', 'email']
    });
    console.log('---INICIO_LISTA---');
    console.log(JSON.stringify(users, null, 2));
    console.log('---FIN_LISTA---');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

listAdvisors();
