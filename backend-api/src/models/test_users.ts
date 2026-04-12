
import { Usuario } from './index';
import bcrypt from 'bcrypt';

async function test() {
  try {
    console.log('--- TEST DE USUARIOS ---');
    const users = await Usuario.findAll();
    console.log(`Encontrados ${users.length} usuarios.`);
    users.forEach((u: any) => {
      console.log(`- ${u.username} (${u.rol})`);
    });
    
    const admin = users.find((u: any) => u.username === 'admin');
    if (admin) {
      const pass = 'admin123';
      const match = await bcrypt.compare(pass, admin.getDataValue('password_hash'));
      console.log(`Prueba password 'admin123' para 'admin': ${match ? 'EXITOSA' : 'FALLIDA'}`);
    }
  } catch (err) {
    console.error('Error en test:', err);
  } finally {
    process.exit();
  }
}
test();
