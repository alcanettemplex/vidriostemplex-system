import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function run() {
    try {
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS cantidad_total INTEGER DEFAULT 1;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(100);');
        console.log('Columns cantidad_total and tipo_servicio added to odp');
    } catch (e) { console.error(e); }
    process.exit(0);
}
run();
