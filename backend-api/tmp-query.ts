import { Sequelize, QueryTypes } from 'sequelize';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false
});

async function run() {
  try {
    const users: any = await sequelize.query(`
      SELECT rol, id, nombre_completo, username, email 
      FROM usuarios 
      ORDER BY rol, nombre_completo;
    `, { type: QueryTypes.SELECT });

    const byRole: Record<string, any[]> = {};
    users.forEach((u: any) => {
      const rol = u.rol || 'sin_rol';
      if (!byRole[rol]) byRole[rol] = [];
      byRole[rol].push(u);
    });

    for (const rol in byRole) {
      console.log(`\n=== ROL: ${rol.toUpperCase()} ===`);
      byRole[rol].forEach(u => {
        console.log(`  - ${u.nombre_completo} (ID: ${u.id}, Usuario: ${u.username}, Email: ${u.email || 'N/A'})`);
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

run();
