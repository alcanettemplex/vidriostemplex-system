/**
 * Diagnóstico de egress AGREGADO POR TABLA — versión 2026-07-31.
 *
 * Por qué no basta el script del 2026-07-23:
 *   Ese ordena `pg_stat_statements` por `rows` y muestra el top 25 de queryid. La
 *   cardinalidad variable de los `IN (...)` que emite Sequelize fragmenta UNA misma
 *   consulta en decenas de queryid distintos, así que el top se llena de esquirlas de
 *   la misma consulta y el total real de cada tabla queda repartido e invisible.
 *
 * Método correcto (el que sí dio la respuesta el 2026-07-28):
 *   egress ≈ filas devueltas × ancho real de la fila
 *   1) agrupar TODO pg_stat_statements por tabla origen (GROUP BY, no top N)
 *   2) medir el ancho real con avg(pg_column_size(t.*)) — se agrega en el servidor,
 *      devuelve una sola fila, no genera egress apreciable
 *   3) multiplicar
 *
 * Además agrupa por `userid`: la app se conecta con un rol y el dashboard de Supabase
 * Studio con otro. Eso permite responder "¿esto lo generó el ERP o lo generé yo
 * navegando tablas en el Studio?", que es justo la duda de esta sesión.
 *
 * SOLO LECTURA: no resetea estadísticas ni escribe en la base.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-07-31_egress_por_tabla.ts
 * Guarda snapshot propio en el temp del SO; al re-correrlo muestra el DELTA del período.
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SNAPSHOT_PATH = path.join(os.tmpdir(), 'templex_egress_por_tabla.json');

interface FilaStat {
  tabla: string;
  rol: string;
  calls: number;
  rows: number;
}
interface Snapshot {
  tomado_en: string;
  stats_reset: string | null;
  filas: Record<string, { calls: number; rows: number }>;
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CO');
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

const run = async () => {
  await sequelize.authenticate();

  const ext: any[] = await sequelize.query(
    `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`,
    { type: QueryTypes.SELECT }
  );
  if (ext.length === 0) {
    console.log('\n⚠️  pg_stat_statements no está habilitada. Database → Extensions.\n');
    await sequelize.close();
    return;
  }

  let statsReset: string | null = null;
  try {
    const info: any[] = await sequelize.query(`SELECT stats_reset FROM pg_stat_statements_info`, {
      type: QueryTypes.SELECT,
    });
    statsReset = info[0]?.stats_reset ? new Date(info[0].stats_reset).toISOString() : null;
  } catch { /* PG < 14 */ }

  // ── 1) Agregado por tabla + rol ────────────────────────────────────────────────
  // La tabla se extrae del texto normalizado: primer `from "tabla"` o `join "tabla"`.
  // Se ignoran las consultas que no leen filas (INSERT/UPDATE devuelven ~0 rows).
  const stats: FilaStat[] = await sequelize.query(
    `
    WITH base AS (
      SELECT s.userid,
             r.rolname                                   AS rol,
             s.calls,
             s.rows,
             lower(regexp_replace(s.query, '\\s+', ' ', 'g')) AS q
        FROM pg_stat_statements s
        LEFT JOIN pg_roles r ON r.oid = s.userid
       WHERE s.query NOT ILIKE '%pg_stat_statements%'
         AND s.rows > 0
    )
    SELECT COALESCE(
             (regexp_match(q, 'from\\s+"?([a-z_][a-z0-9_]*)"?'))[1],
             (regexp_match(q, 'join\\s+"?([a-z_][a-z0-9_]*)"?'))[1],
             '(sin tabla)'
           )                        AS tabla,
           COALESCE(rol, '?')       AS rol,
           SUM(calls)::bigint       AS calls,
           SUM(rows)::bigint        AS rows
      FROM base
     GROUP BY 1, 2
     ORDER BY rows DESC
    `,
    { type: QueryTypes.SELECT }
  );

  // ── 2) Ancho real de fila de las tablas del esquema public ────────────────────
  const tablasReales: any[] = await sequelize.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    { type: QueryTypes.SELECT }
  );
  const nombresReales = new Set(tablasReales.map((t) => t.tablename));

  const anchos: Record<string, { bytes: number; filas: number }> = {};
  for (const t of tablasReales) {
    const nombre = t.tablename;
    try {
      const r: any[] = await sequelize.query(
        `SELECT COALESCE(avg(pg_column_size(x.*)), 0)::numeric AS ancho, count(*)::bigint AS filas FROM "${nombre}" x`,
        { type: QueryTypes.SELECT }
      );
      anchos[nombre] = { bytes: Number(r[0].ancho), filas: Number(r[0].filas) };
    } catch {
      anchos[nombre] = { bytes: 0, filas: 0 };
    }
  }

  // ── 3) Snapshot previo → delta ────────────────────────────────────────────────
  let previo: Snapshot | null = null;
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try { previo = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')); } catch { previo = null; }
  }
  const deltaValido = previo && previo.stats_reset === statsReset;

  console.log(`\n${'═'.repeat(112)}`);
  console.log('  EGRESS POR TABLA — filas devueltas × ancho real de fila');
  console.log(`  Estadísticas acumuladas desde: ${statsReset ?? 'desconocido'}`);
  if (deltaValido && previo) {
    const horas = ((Date.now() - new Date(previo.tomado_en).getTime()) / 3.6e6).toFixed(1);
    console.log(`  📸 Delta contra foto de ${previo.tomado_en} (hace ~${horas} h)`);
  } else if (previo) {
    console.log('  ⚠️  Hubo reset de estadísticas — el delta no es comparable, se muestra el acumulado.');
  } else {
    console.log('  📸 Primera foto de este script — solo acumulado.');
  }
  console.log(`${'═'.repeat(112)}\n`);

  console.log(
    `  ${'TABLA'.padEnd(30)} ${'ROL'.padEnd(18)} ${'FILAS'.padStart(12)} ${'B/FILA'.padStart(8)} ` +
    `${'MB EST.'.padStart(9)} ${'LLAM'.padStart(9)} ${'F/LLAM'.padStart(8)}`
  );
  console.log(`  ${'─'.repeat(108)}`);

  let totalMb = 0;
  const porRol: Record<string, number> = {};
  const nuevo: Snapshot = { tomado_en: new Date().toISOString(), stats_reset: statsReset, filas: {} };
  const listado: { linea: string; bytes: number }[] = [];

  for (const s of stats) {
    const clave = `${s.tabla}|${s.rol}`;
    nuevo.filas[clave] = { calls: Number(s.calls), rows: Number(s.rows) };

    const ant = previo?.filas[clave];
    const rowsUsadas = deltaValido ? Number(s.rows) - (ant?.rows ?? 0) : Number(s.rows);
    const callsUsadas = deltaValido ? Number(s.calls) - (ant?.calls ?? 0) : Number(s.calls);
    if (rowsUsadas <= 0) continue;

    const ancho = anchos[s.tabla]?.bytes ?? 0;
    // Las consultas de catálogo del sistema (pg_*, information_schema) no tienen ancho
    // medible aquí; se les asigna 100 B/fila como orden de magnitud para no perderlas
    // del ranking, marcándolas con "~".
    const esReal = nombresReales.has(s.tabla);
    const bytesFila = esReal ? ancho : 100;
    const bytes = rowsUsadas * bytesFila;
    totalMb += bytes;
    porRol[s.rol] = (porRol[s.rol] ?? 0) + bytes;

    listado.push({
      bytes,
      linea:
        `  ${(esReal ? s.tabla : '~' + s.tabla).slice(0, 30).padEnd(30)} ${s.rol.slice(0, 18).padEnd(18)} ` +
        `${fmt(rowsUsadas).padStart(12)} ${fmt(bytesFila).padStart(8)} ${mb(bytes).padStart(9)} ` +
        `${fmt(callsUsadas).padStart(9)} ${(callsUsadas > 0 ? rowsUsadas / callsUsadas : 0).toFixed(1).padStart(8)}`,
    });
  }

  listado.sort((a, b) => b.bytes - a.bytes);
  listado.slice(0, 30).forEach((l) => console.log(l.linea));

  console.log(`\n  ${'─'.repeat(108)}`);
  console.log(`  TOTAL ESTIMADO DEL PERÍODO: ${mb(totalMb)} MB`);
  console.log('\n  Desglose por rol de conexión (¿la app o el dashboard de Supabase?):');
  Object.entries(porRol)
    .sort((a, b) => b[1] - a[1])
    .forEach(([rol, bytes]) => {
      const pct = totalMb > 0 ? ((bytes / totalMb) * 100).toFixed(1) : '0';
      console.log(`    ${rol.padEnd(24)} ${mb(bytes).padStart(9)} MB  (${pct}%)`);
    });

  // ── 4) Tablas más pesadas por fila (contexto para decidir dónde recortar) ─────
  console.log('\n  Tablas más anchas (bytes/fila × filas totales en la base):');
  Object.entries(anchos)
    .filter(([, v]) => v.filas > 0)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 10)
    .forEach(([t, v]) => {
      console.log(`    ${t.padEnd(30)} ${fmt(v.bytes).padStart(7)} B/fila × ${fmt(v.filas).padStart(8)} filas = ${mb(v.bytes * v.filas).padStart(8)} MB`);
    });

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(nuevo, null, 2), 'utf-8');
  console.log(`\n  💾 Foto guardada en: ${SNAPSHOT_PATH}\n`);

  await sequelize.close();
};

run().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
