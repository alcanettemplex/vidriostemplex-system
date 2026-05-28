// Script one-off: corrección de estados de producción para 9 ODPs
// Ejecutar: node src/scripts/correccion_estados_odp.js
// Fecha corrección: 27/05/2026 | Usuario: Admin (ID: 1)

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL no definida'); process.exit(1); }

const FECHA = '2026-05-27T12:00:00.000Z';
const USUARIO_ID = 1; // Admin

// → INSTALADA (instalacion=true)
const A_INSTALADA = [
  { id: 134, numero: 'ODP-23923', anterior: 'PROGRAMADA' },
  { id: 110, numero: 'ODP-23902', anterior: 'PROGRAMADA' },
  { id: 106, numero: 'ODP-23898', anterior: 'PROGRAMADA' },
];

// → ENTREGADA (sin instalacion / acarreo puro / entrega en taller)
const A_ENTREGADA = [
  { id: 170, numero: 'ODP-23956', anterior: 'PROGRAMADA' },
  { id: 166, numero: 'ODP-23952', anterior: 'PROGRAMADA' },
  { id: 161, numero: 'ODP-23948', anterior: 'LISTO_INSTALAR' },
  { id: 149, numero: 'ODP-23938', anterior: 'LISTO_INSTALAR' },
  { id: 135, numero: 'ODP-23924', anterior: 'LISTO_INSTALAR' },
  { id: 119, numero: 'ODP-23911', anterior: 'LISTO_INSTALAR' },
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado a Supabase.\n');

  try {
    await client.query('BEGIN');

    // --- UPDATE estados ---
    const idsInstalada = A_INSTALADA.map(o => o.id);
    const idsEntregada = A_ENTREGADA.map(o => o.id);

    const r1 = await client.query(
      `UPDATE odp SET estado_produccion = 'INSTALADA' WHERE id = ANY($1::int[])`,
      [idsInstalada]
    );
    console.log(`✅ INSTALADA: ${r1.rowCount} ODPs actualizadas (${A_INSTALADA.map(o => o.numero).join(', ')})`);

    const r2 = await client.query(
      `UPDATE odp SET estado_produccion = 'ENTREGADA' WHERE id = ANY($1::int[])`,
      [idsEntregada]
    );
    console.log(`✅ ENTREGADA: ${r2.rowCount} ODPs actualizadas (${A_ENTREGADA.map(o => o.numero).join(', ')})`);

    // --- INSERT historial ---
    let totalHistorial = 0;
    for (const odp of [...A_INSTALADA, ...A_ENTREGADA]) {
      const estadoNuevo = A_INSTALADA.includes(odp) ? 'INSTALADA' : 'ENTREGADA';
      await client.query(
        `INSERT INTO historial_estados_odp (odp_id, estado_anterior, estado_nuevo, usuario_id, fecha)
         VALUES ($1, $2, $3, $4, $5)`,
        [odp.id, odp.anterior, estadoNuevo, USUARIO_ID, FECHA]
      );
      totalHistorial++;
    }
    console.log(`✅ historial_estados_odp: ${totalHistorial} registros insertados`);

    await client.query('COMMIT');
    console.log('\n✅ Transacción completada exitosamente.');

    // --- Verificación ---
    console.log('\n--- Verificación final ---');
    const check = await client.query(
      `SELECT numero_odp, estado_produccion FROM odp WHERE id = ANY($1::int[]) ORDER BY id`,
      [[...idsInstalada, ...idsEntregada]]
    );
    check.rows.forEach(r => console.log(`  ${r.numero_odp}: ${r.estado_produccion}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error — ROLLBACK ejecutado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
