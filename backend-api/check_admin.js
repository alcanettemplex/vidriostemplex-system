const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, { 
  dialect: 'postgres',
  ssl: true,
  dialectOptions: { ssl: { rejectUnauthorized: false } }
});

(async () => {
  try {
    const result = await sequelize.query('SELECT id, username, rol, nombre_completo FROM usuarios WHERE username = $1 LIMIT 1', {
      bind: ['admin'],
      type: sequelize.QueryTypes.SELECT
    });
    console.log('Usuario admin encontrado:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error al conectar:', err.message);
    process.exit(1);
  }
})();
