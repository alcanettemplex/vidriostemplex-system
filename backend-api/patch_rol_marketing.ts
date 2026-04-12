import { sequelize } from './src/models';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión establecida.');
    await sequelize.query("ALTER TYPE enum_usuarios_rol ADD VALUE IF NOT EXISTS 'marketing';");
    console.log('Parche de BD ejecutado: Marketing inyectado en ENUM postgres.');
  } catch (error) {
    console.error('Error parcheando BD:', error);
  } finally {
    process.exit(0);
  }
})();
