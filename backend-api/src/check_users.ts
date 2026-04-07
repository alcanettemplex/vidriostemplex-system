import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  dialectOptions: { ssl: { rejectUnauthorized: false } },
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    const [users]: any = await sequelize.query("SELECT id, nombre_completo, rol FROM usuarios WHERE rol IN ('asesor_comercial', 'admin', 'gerencia', 'asistente_administrativo')");
    console.log('USUARIOS_FOUND:', JSON.stringify(users));
    await sequelize.close();
  } catch (err: any) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
