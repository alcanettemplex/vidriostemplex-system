import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

async function updateRoles() {
  try {
    await sequelize.authenticate();
    console.log('DB connected OK');

    // Agregar nuevos roles al ENUM de Postgres
    const newRoles = ['taller', 'compras', 'gerente'];
    for (const rol of newRoles) {
      try {
        await sequelize.query(`ALTER TYPE "enum_usuarios_rol" ADD VALUE IF NOT EXISTS '${rol}'`);
        console.log(`Role '${rol}' added OK`);
      } catch (e: any) {
        console.log(`Role '${rol}': ${e.message}`);
      }
    }

    // Crear usuarios para los nuevos roles
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('123456', 10);

    // Insertar directamente con SQL para evitar conflictos con el modelo
    const usersToCreate = [
      { username: 'taller1', nombre_completo: 'Operario Taller', email: 'taller1@templex.com', rol: 'taller' },
      { username: 'compras1', nombre_completo: 'Gestor de Compras', email: 'compras1@templex.com', rol: 'compras' },
      { username: 'contable1', nombre_completo: 'Contador Templex', email: 'contable1@templex.com', rol: 'contabilidad' },
      { username: 'gerente1', nombre_completo: 'Gerente General', email: 'gerente@templex.com', rol: 'gerente' },
    ];

    for (const u of usersToCreate) {
      try {
        await sequelize.query(
          `INSERT INTO usuarios (username, password_hash, rol, nombre_completo, email) 
           VALUES (:username, :hash, :rol, :nombre_completo, :email)
           ON CONFLICT (username) DO NOTHING`,
          { replacements: { ...u, hash } }
        );
        console.log(`Usuario '${u.username}' (${u.rol}) creado`);
      } catch (e: any) {
        console.log(`Usuario '${u.username}': ${e.message}`);
      }
    }

    console.log('\n✅ Todos los roles y usuarios creados exitosamente');
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateRoles();
