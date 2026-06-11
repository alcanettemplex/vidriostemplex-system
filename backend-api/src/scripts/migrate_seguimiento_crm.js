/** Migración: etapa SEGUIMIENTO en CRM (ENUM + columna fecha_seguimiento). */
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();

  const existe = await client.query(`
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_leads_estado_crm' AND e.enumlabel = 'SEGUIMIENTO'
  `);
  if (existe.rows.length === 0) {
    await client.query(`ALTER TYPE enum_leads_estado_crm ADD VALUE 'SEGUIMIENTO' AFTER 'COTIZANDO'`);
    console.log('✅ ENUM: SEGUIMIENTO agregado después de COTIZANDO');
  } else {
    console.log('⏭ ENUM: SEGUIMIENTO ya existe');
  }

  await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fecha_seguimiento TIMESTAMPTZ`);
  console.log('✅ Columna leads.fecha_seguimiento creada (TIMESTAMPTZ, nullable)');

  const verif = await client.query(`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_leads_estado_crm'
    ORDER BY e.enumsortorder
  `);
  console.log('Orden final del ENUM:', verif.rows.map(r => r.enumlabel).join(' → '));

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
