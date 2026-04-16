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

    // Cambio 1: pedido_pv — control de reposición
    await sequelize.query(`
      ALTER TABLE pedido_pv
        ADD COLUMN IF NOT EXISTS tipo_problema       VARCHAR(20),
        ADD COLUMN IF NOT EXISTS estado_reposicion   VARCHAR(20),
        ADD COLUMN IF NOT EXISTS fecha_reposicion_prometida DATE;
    `);
    console.log('✓ pedido_pv: tipo_problema, estado_reposicion, fecha_reposicion_prometida');

    // Cambio 2: odp — tipo de orden
    await sequelize.query(`
      ALTER TABLE odp
        ADD COLUMN IF NOT EXISTS tipo_odp VARCHAR(10) NOT NULL DEFAULT 'ODP';
    `);
    console.log('✓ odp: tipo_odp');

    console.log('\nMigración completada.');
  } catch (err) {
    console.error('Error en migración:', err);
  } finally {
    await sequelize.close();
  }
}

run();
