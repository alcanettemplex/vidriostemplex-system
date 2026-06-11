/** Prueba no destructiva: valida INSERT/UPDATE con estado SEGUIMIENTO dentro de una transacción que se revierte. */
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  await client.query('BEGIN');
  try {
    const ins = await client.query(`
      INSERT INTO leads (telefono, nombre, estado_crm, asistente_id, "createdAt", "updatedAt")
      VALUES ('0000000000', '__TEST_SEGUIMIENTO__', 'COTIZANDO', 30, NOW(), NOW())
      RETURNING id
    `);
    const id = ins.rows[0].id;
    const upd = await client.query(`
      UPDATE leads SET estado_crm = 'SEGUIMIENTO', fecha_seguimiento = NOW()
      WHERE id = $1
      RETURNING estado_crm, fecha_seguimiento
    `, [id]);
    console.log('✅ UPDATE a SEGUIMIENTO aceptado:', upd.rows[0]);
  } finally {
    await client.query('ROLLBACK');
    console.log('↩ ROLLBACK ejecutado — ningún dato persistido');
  }
  await client.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
