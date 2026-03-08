import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function run() {
    try {
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS servicios_detalle JSON;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS observaciones TEXT;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS direccion_instalacion VARCHAR(255);');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS matizado BOOLEAN DEFAULT false;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS pelicula BOOLEAN DEFAULT false;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS acarreo BOOLEAN DEFAULT false;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS instalacion BOOLEAN DEFAULT false;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS huacal BOOLEAN DEFAULT false;');
        await sequelize.query('ALTER TABLE odp ADD COLUMN IF NOT EXISTS carton BOOLEAN DEFAULT false;');
        console.log('Columns added to odp');
    } catch (e) { console.error(e); }
    process.exit(0);
}
run();
