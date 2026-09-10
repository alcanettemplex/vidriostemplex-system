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
  },
  hooks: {
    // El pooler de Supabase abre las sesiones con `extra_float_digits` bajo, y
    // con ese ajuste Postgres serializa `double precision` a 15 dígitos
    // significativos en vez de usar la representación exacta más corta. El
    // valor vuelve redondeado: 21421.56862745098 se lee como 21421.568627451.
    //
    // A los importes del ERP no les afecta (la única columna float fuera del
    // cotizador es alertas_umbral.valor), pero las 41 columnas double del
    // cotizador guardan coeficientes de fórmulas de corte y precios sin
    // redondear, y ahí lo leído tiene que ser idéntico a lo escrito.
    //
    // Se aplica por conexión y no como parámetro de arranque porque el pooler
    // en modo transacción no propaga los parámetros de startup. `3` es el valor
    // que garantiza round-trip exacto y coincide con el comportamiento por
    // defecto del servidor desde PostgreSQL 12 — que es justo lo que el pooler
    // estaba pisando.
    afterConnect: async (connection: unknown) => {
      await (connection as { query: (sql: string) => Promise<unknown> }).query(
        'SET extra_float_digits = 3'
      );
    },
  },
});

export default sequelize;
