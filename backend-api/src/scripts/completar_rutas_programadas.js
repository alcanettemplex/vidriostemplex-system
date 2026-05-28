// Script one-off: marcar 3 rutas programadas como completadas
// Ruta #80 (creada 22/05), #76 (creada 20/05), #72 (creada 20/05)
// ODP-23860 queda sin cambios. fin_ruta = fecha de creación a las 17:00.

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL no definida'); process.exit(1); }

const RUTAS = [
  { id: 80, fin_ruta: '2026-05-22T17:00:00' },
  { id: 76, fin_ruta: '2026-05-20T17:00:00' },
  { id: 72, fin_ruta: '2026-05-20T17:00:00' },
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Supabase.\n');

  try {
    await client.query('BEGIN');

    for (const ruta of RUTAS) {
      // 1. Marcar ruta como completada
      const r1 = await client.query(
        `UPDATE rutas_instalacion SET estado = 'completada', fin_ruta = $1 WHERE id = $2`,
        [ruta.fin_ruta, ruta.id]
      );
      console.log(`✅ Ruta #${ruta.id}: estado=completada, fin_ruta=${ruta.fin_ruta} (${r1.rowCount} fila)`);

      // 2. Marcar todas las ruta_odps pendientes de esa ruta como completadas
      const r2 = await client.query(
        `UPDATE ruta_odp SET estado = 'completada' WHERE ruta_id = $1 AND estado = 'pendiente'`,
        [ruta.id]
      );
      console.log(`   ruta_odp: ${r2.rowCount} ODP(s) marcadas como completadas`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Transacción completada exitosamente.');

    // Verificación
    console.log('\n--- Verificación final ---');
    const check = await client.query(
      `SELECT ri.id, ri.estado, ri.fin_ruta,
              COUNT(ro.id) AS total_odps,
              SUM(CASE WHEN ro.estado = 'completada' THEN 1 ELSE 0 END) AS completadas
       FROM rutas_instalacion ri
       LEFT JOIN ruta_odp ro ON ro.ruta_id = ri.id
       WHERE ri.id = ANY($1::int[])
       GROUP BY ri.id, ri.estado, ri.fin_ruta
       ORDER BY ri.id`,
      [[80, 76, 72]]
    );
    check.rows.forEach(r =>
      console.log(`  Ruta #${r.id}: estado=${r.estado} | fin_ruta=${r.fin_ruta?.toISOString().slice(0,10)} | ODPs ${r.completadas}/${r.total_odps} completadas`)
    );

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error — ROLLBACK ejecutado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
