import { sequelize } from './src/models';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión establecida.');

    // 1. Ver todos los constraints actuales de la tabla usuarios
    const [constraints] = await sequelize.query(`
      SELECT conname, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'usuarios'::regclass AND contype = 'c';
    `);
    console.log('🔍 CHECK CONSTRAINTS actuales:', JSON.stringify(constraints, null, 2));

    // 2. Eliminar el check constraint problemático
    await sequelize.query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;`);
    console.log('🗑️ Constraint usuarios_rol_check eliminado.');

    // 3. Recrear el constraint con todos los roles incluyendo asistente_administrativo
    await sequelize.query(`
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
        rol IN (
          'root',
          'admin',
          'gerencia',
          'jefe_produccion',
          'asesor_comercial',
          'produccion',
          'instalador',
          'conductor',
          'contabilidad',
          'compras',
          'asistente_administrativo'
        )
      );
    `);
    console.log('✅ Constraint recreado con asistente_administrativo incluido.');

    // 4. Verificar ENUM también
    await sequelize.query(`ALTER TYPE enum_usuarios_rol ADD VALUE IF NOT EXISTS 'asistente_administrativo';`);
    console.log('✅ ENUM verificado/actualizado.');

    // 5. Test de inserción real
    const [testResult] = await sequelize.query(`
      SELECT 'asistente_administrativo'::enum_usuarios_rol AS test_rol;
    `);
    console.log('✅ Test de cast ENUM:', JSON.stringify(testResult));

    console.log('\n🎉 Parche completo. Puedes crear el usuario ahora.');
  } catch (error) {
    console.error('❌ Error parcheando BD:', error);
  } finally {
    process.exit(0);
  }
})();
