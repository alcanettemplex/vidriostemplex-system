/**
 * Migración: Módulo de No Conformidades
 * - Añade columnas es_no_conformidad y odp_padre_id a ODP
 * - Añade PAUSADA al ENUM estado_produccion
 * - Añade columna nueva_odp_id a no_conformidades
 */
import dotenv from 'dotenv';
dotenv.config();

import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la BD.');

    // 1. Añadir PAUSADA al ENUM de estado_produccion
    try {
      await sequelize.query(`ALTER TYPE "enum_odp_estado_produccion" ADD VALUE IF NOT EXISTS 'PAUSADA';`);
      console.log('✅ PAUSADA añadido al ENUM estado_produccion.');
    } catch (e: any) {
      console.log('⚠️  PAUSADA ya existe o error:', e.message);
    }

    // 2. Añadir columnas a ODP
    try {
      await sequelize.query(`ALTER TABLE odp ADD COLUMN IF NOT EXISTS es_no_conformidad BOOLEAN DEFAULT false;`);
      console.log('✅ Columna es_no_conformidad añadida a ODP.');
    } catch (e: any) {
      console.log('⚠️  es_no_conformidad:', e.message);
    }

    try {
      await sequelize.query(`ALTER TABLE odp ADD COLUMN IF NOT EXISTS odp_padre_id INTEGER REFERENCES odp(id);`);
      console.log('✅ Columna odp_padre_id añadida a ODP.');
    } catch (e: any) {
      console.log('⚠️  odp_padre_id:', e.message);
    }

    // 3. Crear tabla reportes_no_conformidad si no existe (el modelo ya la crea via sync)
    // Pero asegurar la columna nueva_odp_id
    try {
      await sequelize.query(`ALTER TABLE no_conformidades ADD COLUMN IF NOT EXISTS nueva_odp_id INTEGER REFERENCES odp(id);`);
      console.log('✅ Columna nueva_odp_id añadida a no_conformidades.');
    } catch (e: any) {
      console.log('⚠️  nueva_odp_id:', e.message);
    }

    console.log('\n🎉 Migración de No Conformidades completada exitosamente.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
})();
