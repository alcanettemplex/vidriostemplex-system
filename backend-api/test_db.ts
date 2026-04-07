import Usuario from './src/models/usuario.model';
import bcrypt from 'bcrypt';
import sequelize from './src/config/database';

async function test() {
  try {
    await sequelize.authenticate();
    const users = await Usuario.findAll({ limit: 5 });
    console.log('Usuarios encontrados:', users.map(u => u.getDataValue('username')));
    
    // Probar contra el primero si tiene password_hash
    if (users.length > 0) {
      const user = users[0];
      const pass = 'templex2026'; // Suponiendo un password común si existe
      const hash = user.getDataValue('password_hash');
      const valid = await bcrypt.compare(pass, hash);
      console.log(`Prueba con ${user.getDataValue('username')}:`, valid ? 'VÁLIDO' : 'INVÁLIDO');
    }
  } catch (e) {
    console.error('Error en test:', e);
  } finally {
    await sequelize.close();
  }
}

test();
