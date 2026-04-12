import { sequelize } from './src/models';

(async () => {
  try {
    await sequelize.authenticate();

    // 1. Ver el CHECK CONSTRAINT actual
    const [constraints] = await sequelize.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = 'usuarios')
      AND contype = 'c';
    `);
    console.log('CHECK CONSTRAINTS actuales:');
    console.log(JSON.stringify(constraints, null, 2));

    // 2. Ver los valores del ENUM si existe
    const [enums] = await sequelize.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE typname = 'enum_usuarios_rol'
      ORDER BY enumsortorder;
    `);
    console.log('\nENUM valores actuales:');
    console.log(JSON.stringify(enums, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
})();
