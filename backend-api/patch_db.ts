import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  logging: true,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function run() {
  try {
    await sequelize.authenticate();
    await sequelize.query(`ALTER TYPE "enum_usuarios_rol" ADD VALUE IF NOT EXISTS 'asistente_administrativo';`);
    console.log('ENUM actualizado correctamente sin alterar tablas.');
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log('El ENUM asistente_administrativo ya existía.');
    } else {
      console.error('Error alterando type ENUM:', e);
    }
  } finally {
    await sequelize.close();
  }
}
run();
