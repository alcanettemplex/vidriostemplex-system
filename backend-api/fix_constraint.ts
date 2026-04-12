import { sequelize } from './src/models';

(async () => {
  try {
    await sequelize.authenticate();

    // 1. Eliminar el CHECK CONSTRAINT antiguo
    await sequelize.query(`
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
    `);
    console.log('✅ CHECK CONSTRAINT antiguo eliminado.');

    // 2. Crear el nuevo CHECK CONSTRAINT con todos los roles (incluyendo marketing)
    await sequelize.query(`
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol::text = ANY (ARRAY[
        'root', 'admin', 'gerencia', 'gerente',
        'jefe_produccion', 'asesor_comercial', 'produccion',
        'auxiliar_produccion', 'instalador', 'conductor',
        'contabilidad', 'compras', 'asistente_administrativo',
        'taller', 'marketing'
      ]));
    `);
    console.log('✅ Nuevo CHECK CONSTRAINT creado con el rol marketing incluido.');

    // 3. Verificar resultado
    const [constraints]: any = await sequelize.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = 'usuarios')
      AND contype = 'c';
    `);
    console.log('\nCHECK CONSTRAINT actualizado:');
    console.log(constraints[0]?.definition);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
})();
