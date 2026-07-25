import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  // Pool explícito: por defecto Sequelize mantiene min:0 e idle:10s, así que tras
  // cada silencio de 10s cierra las conexiones y la siguiente acción reabre desde
  // cero (autenticando de nuevo en el pooler). Con min:2 e idle:30s conservamos
  // conexiones calientes y reducimos ese churn de reconexiones. No cambia egress
  // de datos; mejora latencia y estabilidad del primer request tras inactividad.
  pool: {
    max: 10,
    min: 2,
    idle: 30000,
    acquire: 60000,
    evict: 15000,
  }
});

export default sequelize;
