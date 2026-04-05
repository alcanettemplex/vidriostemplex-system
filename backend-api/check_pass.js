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
      console.log('Usuario admin no encontrado');
      process.exit(1);
    }
    
    const user = result[0];
    console.log('Usuario:', user.username);
    console.log('Password Hash:', user.password_hash);
    console.log('');
    
    // Probar con varias contraseñas comunes
    const passwords = ['admin123', 'admin', 'password', '123456', 'Admin123!'];
    for (const pwd of passwords) {
      const valid = await bcrypt.compare(pwd, user.password_hash);
      if (valid) {
        console.log(`✅ La contraseña correcta es: "${pwd}"`);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
