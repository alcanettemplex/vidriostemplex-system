/**
 * reparar_secuencias_2026-07-02.ts
 * ---------------------------------------------------------------------------
 * INCIDENTE: la migración de la BD a otra cuenta de Supabase (pg_dump/restore)
 * reinsertó todas las filas con sus IDs originales pero NO reajustó las
 * secuencias de PK ni restableció el vínculo OWNED BY. Resultado: cada INSERT
 * nuevo genera un id que YA existe -> viola la PRIMARY KEY -> Sequelize lo
 * reporta como "Validation error" (SequelizeUniqueConstraintError). Esto dejó
 * bloqueados los inserts en casi toda la base (pagos, salidas, rutas, leads...).
 *
 * QUÉ HACE:
 *   1. Descubre dinámicamente TODAS las columnas serial (column_default nextval)
 *      y su secuencia, parseando el nombre desde el default (pg_get_serial_sequence
 *      está roto porque el OWNED BY se perdió en el restore).
 *   2. setval a MAX(id) real (o reset a 1 si la tabla está vacía).
 *   3. Restablece ALTER SEQUENCE ... OWNED BY tabla.columna (preventivo).
 *   4. Reporta antes/después y re-verifica que ninguna quede desincronizada.
 *
 * SEGURIDAD: setval solo adelanta el contador; NO modifica ni una fila de datos.
 * Idempotente: puede re-ejecutarse sin efectos adversos.
 *
 * USO (one-off, NO se corre con npm run dev):
 *   cd backend-api && npx ts-node src/scripts/reparar_secuencias_2026-07-02.ts
 * ---------------------------------------------------------------------------
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

interface FilaSerial {
  table_name: string;
  column_name: string;
  column_default: string;
}

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // limitación del pooler de Supabase
  });

  await client.connect();
  console.log('Conectado a la BD. Iniciando reparación de secuencias...\n');

  try {
    const { rows } = await client.query<FilaSerial>(`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_default LIKE 'nextval%'
      ORDER BY table_name;
    `);

    console.log(`Columnas serial detectadas: ${rows.length}\n`);

    const reparadas: string[] = [];
    const sinCambio: string[] = [];
    const errores: string[] = [];

    for (const r of rows) {
      const match = r.column_default.match(/nextval\('([^']+)'/);
      if (!match) {
        errores.push(`${r.table_name}.${r.column_name}: no se pudo parsear la secuencia (${r.column_default})`);
        continue;
      }
      // La secuencia puede venir como "schema.seq" o "seq"; se usa tal cual entre comillas por seguridad.
      const seqRaw = match[1];
      const seqQuoted = seqRaw
        .split('.')
        .map((part: string) => `"${part.replace(/"/g, '')}"`)
        .join('.');

      const tbl = `"${r.table_name}"`;
      const col = `"${r.column_name}"`;

      try {
        // Estado previo
        const prev = await client.query(`SELECT last_value, is_called FROM ${seqQuoted};`);
        const prevLast = String(prev.rows[0].last_value);
        const prevCalled = prev.rows[0].is_called;

        // MAX(id) real
        const maxRes = await client.query(`SELECT COALESCE(MAX(${col}), 0) AS maxid FROM ${tbl};`);
        const maxid = BigInt(maxRes.rows[0].maxid);

        // Reajuste: si hay filas -> setval(MAX, true) (próximo = MAX+1);
        //           si vacía   -> setval(1, false)   (próximo = 1)
        if (maxid > 0n) {
          await client.query(`SELECT setval('${seqRaw.replace(/'/g, "''")}', $1, true);`, [maxid.toString()]);
        } else {
          await client.query(`SELECT setval('${seqRaw.replace(/'/g, "''")}', 1, false);`);
        }

        // Restablecer pertenencia (preventivo para futuros dumps / DROP COLUMN)
        await client.query(`ALTER SEQUENCE ${seqQuoted} OWNED BY ${tbl}.${col};`);

        // Estado posterior
        const post = await client.query(`SELECT last_value, is_called FROM ${seqQuoted};`);
        const postLast = String(post.rows[0].last_value);
        const postCalled = post.rows[0].is_called;
        const proximo = postCalled ? BigInt(postLast) + 1n : BigInt(postLast);

        const linea = `${r.table_name} (${seqRaw}) | antes last=${prevLast}/called=${prevCalled} -> ahora last=${postLast}/called=${postCalled} | MAX=${maxid} | próximo=${proximo}`;

        if (prevLast !== postLast || prevCalled !== postCalled) {
          reparadas.push(`✔ ${linea}`);
        } else {
          sinCambio.push(`= ${linea}`);
        }

        // Salvaguarda: verificar que ya no colisiona
        if (proximo <= maxid) {
          errores.push(`⚠ ${r.table_name}: tras el fix el próximo (${proximo}) aún <= MAX (${maxid})`);
        }
      } catch (e: any) {
        errores.push(`${r.table_name}.${r.column_name} -> ${seqRaw}: ${e.message}`);
      }
    }

    console.log('########## SECUENCIAS REPARADAS ##########');
    console.log(reparadas.length ? reparadas.join('\n') : '(ninguna)');
    console.log('\n########## SIN CAMBIO (ya estaban correctas) ##########');
    console.log(sinCambio.length ? sinCambio.join('\n') : '(ninguna)');
    if (errores.length) {
      console.log('\n########## ⚠️ ERRORES / ADVERTENCIAS ##########');
      console.log(errores.join('\n'));
    }

    console.log(`\nResumen: ${reparadas.length} reparadas, ${sinCambio.length} sin cambio, ${errores.length} errores.`);
    console.log(errores.length ? '\n⚠️ Revisar errores arriba.' : '\n✅ Todas las secuencias quedaron sincronizadas.');
  } catch (error) {
    console.error('Error ejecutando la reparación:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
    console.log('\nConexión cerrada.');
  }
}

run();
