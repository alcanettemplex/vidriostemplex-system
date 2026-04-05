const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  ssl: true,
  dialectOptions: { ssl: { rejectUnauthorized: false } }
});

(async () => {
  try {
    console.log('🔧 Iniciando fixes en Supabase...\n');
    
    // 1. Eliminar usuarios con auxiliar_produccion
    console.log('1️⃣  Eliminando usuarios con rol auxiliar_produccion...');
    const deleteResult = await sequelize.query(
      'DELETE FROM usuarios WHERE rol = $1',
      { bind: ['auxiliar_produccion'] }
    );
    console.log('   ✅ Eliminados: ' + (deleteResult[1].rowCount || 0) + ' usuarios\n');
    
    // 2. Eliminar constraint viejo
    console.log('2️⃣  Eliminando constraint viejo...');
    try {
      await sequelize.query('ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check');
      console.log('   ✅ Constraint eliminado\n');
    } catch (e) {
      console.log('   ⚠️  Constraint no existía, continuando...\n');
    }
    
    // 3. Agregar nuevo constraint sin auxiliar_produccion
    console.log('3️⃣  Agregando nuevo CHECK CONSTRAINT...');
    const roles = "('root','admin','gerencia','jefe_produccion','asesor_comercial','produccion','instalador','conductor','contabilidad','compras')";
    await sequelize.query(`
      ALTER TABLE usuarios 
      ADD CONSTRAINT usuarios_rol_check 
      CHECK (rol IN ${roles})
    `);
    console.log('   ✅ Constraint agregado\n');
    
    // 4. Agregar columna creado_por a clientes
    console.log('4️⃣  Verificando columna creado_por en clientes...');
    try {
      await sequelize.query(
        'ALTER TABLE clientes ADD COLUMN creado_por INTEGER REFERENCES usuarios(id)'
      );
      console.log('   ✅ Columna creado_por agregada\n');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('   ✅ Columna creado_por ya existe\n');
      } else {
        throw e;
      }
    }
    
    console.log('✅ ¡TODOS LOS FIXES COMPLETADOS!');
    console.log('\nPróximos pasos:');
    console.log('1. Recarga el navegador (Ctrl+F5)');
    console.log('2. Intenta crear un usuario nuevo');
    console.log('3. Ya no verás "Auxiliar de Producción" en la lista');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
