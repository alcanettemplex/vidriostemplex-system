/**
 * patch_cliente_id.ts
 * Agrega la columna cliente_id a la tabla leads si no existe.
 * Ejecutar con: npx ts-node src/patch_cliente_id.ts
 */
import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  dialectOptions: { ssl: { rejectUnauthorized: false } },
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión exitosa a la BD');

    // Columna cliente_id en leads
    await sequelize.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS cliente_id INTEGER;
    `);
    console.log('✅ Columna cliente_id agregada (o ya existía)');

    // Columna monto_proyectado_cotizacion por si tampoco existe
    await sequelize.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS monto_proyectado_cotizacion NUMERIC(12,2);
    `);
    console.log('✅ Columna monto_proyectado_cotizacion verificada');

    // Verificar que existen las columnas
    const [cols] = await sequelize.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'leads'
        AND column_name IN ('cliente_id', 'monto_proyectado_cotizacion')
      ORDER BY column_name;
    `);
    console.log('📋 Columnas verificadas en BD:', cols);

    await sequelize.close();
    console.log('\n🚀 Migración completada. El servidor puede reiniciarse ahora.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
})();
