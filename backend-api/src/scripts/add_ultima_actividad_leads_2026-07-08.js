/**
 * Migración: denormaliza la última actividad de cada lead como columna real.
 *
 * Motivo: el tablero CRM (Pipeline) filtra y ordena por "última actividad"
 * (último evento en lead_eventos). Calcularlo con una subquery correlacionada
 * MAX(createdAt) en cada carga es costoso a medida que crecen los eventos.
 * Esta columna se mantiene por hook Sequelize (LeadEvento.afterCreate en
 * models/index.ts) y se indexa para el filtro por rango de fechas.
 *
 * Ejecutar UNA vez: node src/scripts/add_ultima_actividad_leads_2026-07-08.js
 * (no corre con npm run dev).
 */
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL no definida'); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado.\n');

  // 1. Columna (idempotente)
  await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_actividad TIMESTAMPTZ;`);
  console.log('✓ Columna ultima_actividad asegurada.');

  // 2. Backfill: MAX(createdAt) de eventos; fallback al createdAt del propio lead
  const upd = await client.query(`
    UPDATE leads
    SET ultima_actividad = COALESCE(
      (SELECT MAX(e."createdAt") FROM lead_eventos e WHERE e.lead_id = leads.id),
      leads."createdAt"
    );
  `);
  console.log(`✓ Backfill aplicado a ${upd.rowCount} leads.`);

  // 3. Índice para el filtro por rango
  await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_ultima_actividad ON leads (ultima_actividad);`);
  console.log('✓ Índice idx_leads_ultima_actividad asegurado.');

  // Verificación rápida
  const chk = await client.query(`
    SELECT COUNT(*) AS total, COUNT(ultima_actividad) AS con_valor
    FROM leads;
  `);
  console.log('\nVerificación:', chk.rows[0]);

  await client.end();
  console.log('\nMigración completada.');
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
