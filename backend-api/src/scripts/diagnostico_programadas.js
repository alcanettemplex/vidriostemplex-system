// Script diagnóstico: ODPs con estado_produccion=PROGRAMADA vs rutas activas
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL no definida'); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado.\n');

  // 1. ODPs con estado_produccion=PROGRAMADA
  console.log('=== ODPs con estado_produccion=PROGRAMADA ===');
  const odps = await client.query(`
    SELECT id, numero_odp, estado_produccion, estado_caja, estado_facturacion,
           instalacion, acarreo
    FROM odp WHERE estado_produccion = 'PROGRAMADA'
    ORDER BY id DESC
  `);
  console.table(odps.rows);

  // 2. Rutas activas (programada + en_curso)
  console.log('\n=== Rutas activas (programada + en_curso) ===');
  const rutasActivas = await client.query(`
    SELECT id, estado, inicio_ruta, fin_ruta, creado_en
    FROM rutas_instalacion WHERE estado IN ('programada','en_curso')
    ORDER BY id DESC
  `);
  console.table(rutasActivas.rows);

  // 3. Para cada ODP programada, ver en qué ruta está y cuál es el estado de esa ruta
  console.log('\n=== ODP programadas → ruta asociada ===');
  const ids = odps.rows.map(r => r.id);
  if (ids.length > 0) {
    const detalle = await client.query(`
      SELECT o.id AS odp_id, o.numero_odp, o.estado_produccion,
             ro.ruta_id, ro.estado AS ruta_odp_estado,
             ri.estado AS ruta_estado, ri.fin_ruta
      FROM odp o
      LEFT JOIN ruta_odp ro ON ro.odp_id = o.id
      LEFT JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
      WHERE o.estado_produccion = 'PROGRAMADA'
      ORDER BY o.id DESC
    `);
    console.table(detalle.rows);
  }

  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
