import Usuario from './src/models/usuario.model';
import sequelize from './src/config/database';

async function test() {
  try {
    await sequelize.authenticate();
    const conductor = await Usuario.findOne({ where: { rol: 'conductor' } });
    console.log('Conductor encontrado:', conductor ? conductor.toJSON() : 'NO ENCONTRADO');
    const instalador = await Usuario.findOne({ where: { rol: 'instalador' } });
    console.log('Instalador encontrado:', instalador ? instalador.toJSON() : 'NO ENCONTRADO');
  } catch (e) {
    console.error('Error en test:', e);
  } finally {
    await sequelize.close();
  }
}

test();
