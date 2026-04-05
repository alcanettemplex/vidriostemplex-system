const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  ssl: true,
  dialectOptions: { ssl: { rejectUnauthorized: false } }
});

(async () => {
  try {
    const result = await sequelize.query('SELECT id, username, password_hash FROM usuarios WHERE username = $1', {
      bind: ['admin'],
      type: sequelize.QueryTypes.SELECT
    });
    
    if (result.length === 0) {
      console.log('❌ Usuario admin no encontrado');
      process.exit(1);
    }
    
    const user = result[0];
    console.log('📋 Usuario encontrado: ' + user.username);
    console.log('🔒 Hash actual: ' + user.password_hash);
    console.log('');
    
    // Probar con la contraseña que acabamos de setear
    const passwordsToTest = ['admin123', 'admin', 'Templex2026'];
    console.log('🔐 Probando contraseñas...');
    
    for (const pwd of passwordsToTest) {
      try {
        const valid = await bcrypt.compare(pwd, user.password_hash);
        if (valid) {
          console.log(`✅ CONTRASEÑA CORRECTA: "${pwd}"`);
        } else {
          console.log(`❌ "${pwd}" - NO válida`);
        }
      } catch (err) {
        console.log(`⚠️  Error al validar "${pwd}": ${err.message}`);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
