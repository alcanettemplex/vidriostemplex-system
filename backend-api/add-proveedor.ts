import { sequelize } from './src/models/index';
import { QueryTypes } from 'sequelize';

async function run() {
    try {
        await sequelize.authenticate();
        await sequelize.query(`ALTER TABLE odp ADD COLUMN proveedor_vidrio VARCHAR(100) DEFAULT NULL;`);
        await sequelize.query(`ALTER TABLE odp ADD COLUMN numero_pedido_proveedor VARCHAR(100) DEFAULT NULL;`);
        console.log("Columnas 'proveedor_vidrio' y 'numero_pedido_proveedor' creadas.");
    } catch (err: any) {
        if (err.message.includes('already exists')) {
            console.log('Las columnas ya existen.');
        } else {
            console.error(err);
        }
    }
    process.exit();
}
run();
