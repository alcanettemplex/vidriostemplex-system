/* Migración: agregar columna `activo` a usuarios (baja lógica). Idempotente. */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;`);
  const res = await client.query(`SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns WHERE table_name='usuarios' AND column_name='activo';`);
  console.log('Columna activo:', res.rows);
  await client.end();
})().catch((e) => { console.error(e); process.exit(1); });
