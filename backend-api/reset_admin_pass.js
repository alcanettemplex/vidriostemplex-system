const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  ssl: true,
  dialectOptions: { ssl: { rejectUnauthorized: false } }
});

(async () => {
  try {
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    console.log('Nuevo hash generado:', hashedPassword);
    console.log('Actualizando usuario admin...');
    
    const result = await sequelize.query(
      'UPDATE usuarios SET password_hash = $1 WHERE username = $2 RETURNING id, username',
      {
        bind: [hashedPassword, 'admin'],
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    console.log('✅ Usuario admin actualizado exitosamente');
    console.log('Contraseña: ' + newPassword);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
