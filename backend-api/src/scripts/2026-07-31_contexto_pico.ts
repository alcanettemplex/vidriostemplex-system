/**
 * Contexto del pico de egress del 2026-07-31 — SOLO LECTURA.
 *
 * Responde tres preguntas que el agregado por tabla deja abiertas:
 *   A) ¿Qué consultas concretas leen `ruta_odp` (la tabla más ancha: 8.620 B/fila)
 *      y cuántas filas arrastra cada una?
 *   B) ¿La actividad de los usuarios de hoy fue realmente "normal"? Se mide con
 *      `auditoria_log`, que sella cada escritura con fecha: no mide egress, pero sí
 *      dice si hubo más trabajo humano que de costumbre. Si la actividad es normal y
 *      el egress se multiplicó por 6, el consumo NO vino del uso del ERP.
 *   C) ¿Qué hace tan ancha a `ruta_odp`? Peso por columna.
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const fmt = (n: number) => Math.round(Number(n)).toLocaleString('es-CO');

const run = async () => {
  await sequelize.authenticate();

  // ── A) Consultas que tocan ruta_odp ───────────────────────────────────────────
  console.log(`\n${'═'.repeat(100)}`);
  console.log('  A) CONSULTAS QUE LEEN ruta_odp  (tabla de 8.620 B/fila)');
  console.log(`${'═'.repeat(100)}\n`);

  const q: any[] = await sequelize.query(
    `SELECT calls, rows, (rows::float / NULLIF(calls,0)) AS f_llam,
            round(mean_exec_time::numeric, 1) AS ms,
            left(regexp_replace(query, '\\s+', ' ', 'g'), 150) AS q
       FROM pg_stat_statements
      WHERE query ILIKE '%ruta_odp%'
        AND query NOT ILIKE '%pg_stat_statements%'
        AND rows > 0
      ORDER BY rows DESC
      LIMIT 12`,
    { type: QueryTypes.SELECT }
  );
  q.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. filas=${fmt(r.rows).padStart(9)}  llam=${fmt(r.calls).padStart(6)}  f/llam=${Number(r.f_llam).toFixed(1).padStart(7)}  ${r.ms} ms`);
    console.log(`      ${r.q}\n`);
  });

  // ── C) Peso por columna de ruta_odp ───────────────────────────────────────────
  console.log(`\n${'═'.repeat(100)}`);
  console.log('  C) PESO POR COLUMNA DE ruta_odp — dónde están los 8.620 B/fila');
  console.log(`${'═'.repeat(100)}\n`);

  const cols: any[] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ruta_odp' ORDER BY ordinal_position`,
    { type: QueryTypes.SELECT }
  );
  const expr = cols
    .map((c) => `COALESCE(avg(pg_column_size("${c.column_name}")),0)::int AS "${c.column_name}"`)
    .join(', ');
  const pesos: any[] = await sequelize.query(`SELECT ${expr} FROM ruta_odp`, { type: QueryTypes.SELECT });
  const orden = Object.entries(pesos[0])
    .map(([k, v]) => ({ col: k, bytes: Number(v) }))
    .sort((a, b) => b.bytes - a.bytes);
  const total = orden.reduce((s, o) => s + o.bytes, 0);
  orden.slice(0, 12).forEach((o) => {
    const pct = total > 0 ? ((o.bytes / total) * 100).toFixed(1) : '0';
    console.log(`    ${o.col.padEnd(28)} ${fmt(o.bytes).padStart(8)} B  (${pct.padStart(5)}%)`);
  });
  console.log(`    ${'—'.repeat(48)}`);
  console.log(`    ${'TOTAL'.padEnd(28)} ${fmt(total).padStart(8)} B/fila`);

  // ── B) Actividad humana por día ───────────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(100)}`);
  console.log('  B) ACTIVIDAD REAL DE USUARIOS POR DÍA (auditoria_log = escrituras selladas con fecha)');
  console.log(`${'═'.repeat(100)}\n`);

  const act: any[] = await sequelize.query(
    `SELECT to_char(fecha AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS dia,
            count(*)::int AS escrituras,
            count(DISTINCT usuario_id)::int AS usuarios
       FROM auditoria_log
      WHERE fecha >= now() - interval '12 days'
      GROUP BY 1 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  );
  console.log(`    ${'DÍA'.padEnd(14)} ${'ESCRITURAS'.padStart(11)} ${'USUARIOS'.padStart(9)}   GRÁFICO`);
  const maxAct = Math.max(...act.map((a) => a.escrituras), 1);
  act.forEach((a) => {
    const barra = '█'.repeat(Math.max(1, Math.round((a.escrituras / maxAct) * 40)));
    console.log(`    ${a.dia.padEnd(14)} ${fmt(a.escrituras).padStart(11)} ${fmt(a.usuarios).padStart(9)}   ${barra}`);
  });

  // Actividad de hoy por hora — para ver si el pico coincide con horario laboral
  console.log('\n  Actividad de HOY por hora (hora Bogotá):\n');
  const horas: any[] = await sequelize.query(
    `SELECT to_char(fecha AT TIME ZONE 'America/Bogota', 'HH24') AS hora, count(*)::int AS n
       FROM auditoria_log
      WHERE (fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
      GROUP BY 1 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  );
  if (horas.length === 0) {
    console.log('    (sin escrituras registradas hoy)');
  } else {
    const maxH = Math.max(...horas.map((h) => h.n), 1);
    horas.forEach((h) => {
      console.log(`    ${h.hora}:00  ${fmt(h.n).padStart(5)}  ${'█'.repeat(Math.max(1, Math.round((h.n / maxH) * 40)))}`);
    });
  }

  await sequelize.close();
};

run().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
