import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function run() {
    try {
        await sequelize.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS celular VARCHAR(20);');
        console.log('Column celular added added');
    } catch (e) { console.error(e); }
    process.exit(0);
}
run();
