import { sequelize } from './src/models';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión establecida.');
    await sequelize.query(`ALTER TYPE enum_usuarios_rol ADD VALUE IF NOT EXISTS 'asistente_administrativo';`);
    console.log('Parche de BD ejecutado: Asistente Administrativo inyectado en ENUM postgres.');
  } catch (error) {
    console.error('Error parcheando BD:', error);
  } finally {
    process.exit(0);
  }
})();
