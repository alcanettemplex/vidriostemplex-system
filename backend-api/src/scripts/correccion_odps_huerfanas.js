// Script one-off: corregir ODPs huérfanas en PROGRAMADA con ruta ya completada
// ODP-23953 (id=167), ODP-23944 (id=155), ODP-23894 (id=102) → INSTALADA
// También marca sus ruta_odp pendientes como completadas para consistencia
// ODP-23860 (id=65) se deja sin cambios.

const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL no definida'); process.exit(1); }

const ODPS = [
  { id: 167, numero_odp: 'ODP-23953' },
  { id: 155, numero_odp: 'ODP-23944' },
  { id: 102, numero_odp: 'ODP-23894' },
];

const USUARIO_ID = 1; // Admin
const FECHA = new Date().toISOString();

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado.\n');

  try {
    await client.query('BEGIN');

    for (const odp of ODPS) {
      // 1. ODP → INSTALADA
      const r1 = await client.query(
        `UPDATE odp SET estado_produccion = 'INSTALADA' WHERE id = $1 AND estado_produccion = 'PROGRAMADA'`,
        [odp.id]
      );
      console.log(`✅ ${odp.numero_odp}: estado_produccion → INSTALADA (${r1.rowCount} fila)`);

      // 2. Historial
      await client.query(
        `INSERT INTO historial_estados_odp (odp_id, estado_anterior, estado_nuevo, usuario_id, fecha)
         VALUES ($1, 'PROGRAMADA', 'INSTALADA', $2, $3)`,
        [odp.id, USUARIO_ID, FECHA]
      );
      console.log(`   historial registrado`);

      // 3. ruta_odp pendientes de esa ODP → completadas (consistencia con ruta ya completada)
      const r3 = await client.query(
        `UPDATE ruta_odp ro
         SET estado = 'completada'
         FROM rutas_instalacion ri
         WHERE ro.odp_id = $1
           AND ro.estado = 'pendiente'
           AND ri.id = ro.ruta_id
           AND ri.estado = 'completada'`,
        [odp.id]
      );
      console.log(`   ruta_odp pendientes marcadas completadas: ${r3.rowCount}\n`);
    }

    await client.query('COMMIT');
    console.log('✅ Transacción completada.\n');

    // Verificación
    console.log('--- Verificación ---');
    const check = await client.query(
      `SELECT o.id, o.numero_odp, o.estado_produccion,
              ro.ruta_id, ro.estado AS ruta_odp_estado, ri.estado AS ruta_estado
       FROM odp o
       LEFT JOIN ruta_odp ro ON ro.odp_id = o.id
       LEFT JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       WHERE o.id = ANY($1::int[])
       ORDER BY o.id, ro.ruta_id`,
      [[167, 155, 102]]
    );
    console.table(check.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ROLLBACK:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
