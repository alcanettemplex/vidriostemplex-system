/**
 * Migración 2026-09-04 — `proveedores.seguir_precios` pasa a tri-estado.
 *
 * Antes: BOOLEAN NOT NULL DEFAULT true. Todo emisor nuevo nacía "seguido", así que la
 * primera factura de la gasolinera, el peaje o la papelería ensuciaba la bandeja de
 * mapeo y solo se podía limpiar después, uno por uno.
 *
 * Ahora: NULL = sin decidir · true = seguir · false = ignorado. La ingesta crea los
 * emisores nuevos en NULL y la pantalla de carga pide la decisión.
 *
 * Sequelize sync({ alter: false }) no altera columnas existentes: hay que correr esto.
 *
 *   npx ts-node backend-api/src/scripts/2026_09_04_seguir_precios_tri_estado.ts
 */
import sequelize from '../config/database';

async function main() {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(
      `ALTER TABLE proveedores ALTER COLUMN seguir_precios DROP NOT NULL`,
      { transaction: t }
    );
    await sequelize.query(
      `ALTER TABLE proveedores ALTER COLUMN seguir_precios SET DEFAULT NULL`,
      { transaction: t }
    );
    await t.commit();

    const [filas]: any = await sequelize.query(
      `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'proveedores' AND column_name = 'seguir_precios'`
    );
    console.log('\nColumna migrada:', filas[0], '\n');
  } catch (err) {
    await t.rollback();
    throw err;
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error('Falló la migración:', err);
  process.exit(1);
});
