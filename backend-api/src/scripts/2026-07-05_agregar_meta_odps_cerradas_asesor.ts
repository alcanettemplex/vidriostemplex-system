import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK');

    // KPI "Meta de ODPs cerradas por asesor" en Supervisión CRM — meta configurable
    // desde ConfiguracionPage.tsx, igual que meta_facturacion_mensual.
    await sequelize.query(`
      ALTER TABLE configuracion_global
        ADD COLUMN IF NOT EXISTS meta_odps_cerradas_asesor INTEGER DEFAULT 12;
    `);
    console.log('✓ configuracion_global: meta_odps_cerradas_asesor');

    console.log('\nMigración completada.');
  } catch (err) {
    console.error('Error en migración:', err);
  } finally {
    await sequelize.close();
  }
}

run();
