import 'dotenv/config';
import bcrypt from 'bcrypt';
import Usuario from './models/usuario.model';
import sequelize from './config/database';

const asesores = [
  'Bryam Arrubla',
  'Alejandro Arcila',
  'Juan Diego Cataño',
  'Nataly Londoño'
];

const seedAsesores = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a BD establecida.');

    const passwordHash = await bcrypt.hash('123456', 10);

    for (const nombre of asesores) {
      // Generar un username limpio
      const cleanName = nombre.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents (ñ -> n)
        .replace(/\s+/g, '.');

      const username = cleanName;
      const email = `${cleanName}@vidriostemplex.com`;

      // Comprobar si existe
      const existing = await Usuario.findOne({ where: { username } });
      if (existing) {
        console.log(`El asesor ${nombre} ya existe en la base de datos (${username}). Ignorando.`);
        continue;
      }

      await Usuario.create({
        username,
        password_hash: passwordHash,
        rol: 'asesor_comercial',
        nombre_completo: nombre,
        email
      });

      console.log(`Asesor insertado con éxito: ${nombre} (${username}) - Default pass: 123456`);
    }

    console.log('Proceso finalizado con éxito.');
    process.exit(0);
  } catch (error) {
    console.error('Error insertando asesores:', error);
    process.exit(1);
  }
};

seedAsesores();
