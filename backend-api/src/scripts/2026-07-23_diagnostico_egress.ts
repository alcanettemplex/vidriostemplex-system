/**
 * Diagnóstico de egress — ¿qué consultas de la app transfieren más datos desde Supabase?
 *
 * pg_stat_statements NO mide bytes de red. Mide, por consulta normalizada:
 *   - calls : cuántas veces se ejecutó
 *   - rows  : cuántas filas devolvió en total
 * El mejor proxy de egress = filas devueltas (rows). Más filas × más llamadas = más tráfico saliente.
 *
 * Uso:
 *   Día 1 (hoy):    npx ts-node src/scripts/2026-07-23_diagnostico_egress.ts
 *                   → imprime el top acumulado y guarda una "foto" (snapshot).
 *   Día 2 (mañana): npx ts-node src/scripts/2026-07-23_diagnostico_egress.ts
 *                   → detecta la foto previa y muestra el DELTA (consumo del período),
 *                     aislando lo ocurrido tras desplegar el fix del tablero de Producción.
 *
 * El snapshot se guarda en el temp del SO (estable entre ejecuciones, fuera del repo).
 * Este script es SOLO LECTURA: no resetea estadísticas ni escribe en la BD.
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SNAPSHOT_PATH = path.join(os.tmpdir(), 'templex_egress_snapshot.json');
const TOP_N = 25;

interface StatRow {
  queryid: string;
  calls: number;
  rows: number;
  total_exec_time: number;
  mean_exec_time: number;
  query: string;
}

interface Snapshot {
  tomado_en: string;
  stats_reset: string | null;
  filas: Record<string, { calls: number; rows: number; query: string }>;
}

const fmt = (n: number) => n.toLocaleString('es-CO');
const truncar = (s: string, n: number) => {
  const limpio = s.replace(/\s+/g, ' ').trim();
  return limpio.length > n ? limpio.slice(0, n - 1) + '…' : limpio;
};

const run = async () => {
  await sequelize.authenticate();

  // 1) ¿Está disponible la extensión?
  const ext: any[] = await sequelize.query(
    `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'`,
    { type: QueryTypes.SELECT }
  );
  if (ext.length === 0) {
    console.log('\n⚠️  La extensión pg_stat_statements NO está habilitada en esta base.');
    console.log('   En Supabase: Dashboard → Database → Extensions → habilitar "pg_stat_statements".\n');
    await sequelize.close();
    return;
  }

  // 2) ¿Desde cuándo acumulan las estadísticas? (contexto para interpretar los totales)
  let statsReset: string | null = null;
  try {
    const info: any[] = await sequelize.query(
      `SELECT stats_reset FROM pg_stat_statements_info`,
      { type: QueryTypes.SELECT }
    );
    statsReset = info[0]?.stats_reset ? new Date(info[0].stats_reset).toISOString() : null;
  } catch {
    /* pg_stat_statements_info no existe en PG < 14 — no es crítico */
  }

  // 3) Top consultas por filas devueltas (proxy de egress). Los INSERT/UPDATE devuelven ~0 filas,
  //    así que ordenar por rows DESC prioriza automáticamente los SELECT que sacan datos.
  const rows: StatRow[] = await sequelize.query(
    `SELECT queryid::text        AS queryid,
            calls,
            rows,
            total_exec_time,
            mean_exec_time,
            query
       FROM pg_stat_statements
      WHERE query NOT ILIKE '%pg_stat_statements%'   -- excluir este propio diagnóstico
      ORDER BY rows DESC
      LIMIT ${TOP_N}`,
    { type: QueryTypes.SELECT }
  );

  // 4) Cargar snapshot previo (si existe) para calcular delta
  let previo: Snapshot | null = null;
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      previo = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    } catch {
      previo = null;
    }
  }

  // Si hubo reset entre snapshots, el delta no es comparable
  const resetInvalidaDelta =
    previo && previo.stats_reset !== statsReset;

  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  DIAGNÓSTICO DE EGRESS — top ${TOP_N} consultas por filas devueltas (proxy de tráfico)`);
  console.log(`  Estadísticas acumuladas desde: ${statsReset ?? 'desconocido'}`);
  console.log(`${'═'.repeat(100)}\n`);

  if (previo && !resetInvalidaDelta) {
    const horas = ((Date.now() - new Date(previo.tomado_en).getTime()) / 3.6e6).toFixed(1);
    console.log(`  📸 Comparando contra foto previa de ${previo.tomado_en} (hace ~${horas} h).`);
    console.log(`     Δrows / Δcalls = consumo ocurrido en ese período.\n`);
  } else if (previo && resetInvalidaDelta) {
    console.log(`  ⚠️  Hubo un reset de estadísticas desde la foto previa — el delta no es comparable.`);
    console.log(`     Se muestran solo los totales acumulados actuales.\n`);
  } else {
    console.log(`  📸 Primera foto — no hay comparación previa. Vuelve a correrlo mañana para ver el delta.\n`);
  }

  console.log(
    `  ${'#'.padStart(2)}  ${'FILAS TOT'.padStart(12)}  ${'ΔFILAS'.padStart(12)}  ` +
    `${'LLAMADAS'.padStart(9)}  ${'ΔLLAM'.padStart(7)}  ${'FILAS/LLAM'.padStart(10)}  ${'ms/LLAM'.padStart(8)}`
  );
  console.log(`  ${'─'.repeat(96)}`);

  const mostrarDelta = previo && !resetInvalidaDelta;
  rows.forEach((r, i) => {
    const ant = previo?.filas[r.queryid];
    const dRows = ant ? Number(r.rows) - ant.rows : null;
    const dCalls = ant ? Number(r.calls) - ant.calls : null;
    const filasPorLlam = Number(r.calls) > 0 ? (Number(r.rows) / Number(r.calls)) : 0;

    console.log(
      `  ${String(i + 1).padStart(2)}  ` +
      `${fmt(Number(r.rows)).padStart(12)}  ` +
      `${(mostrarDelta && dRows !== null ? (dRows >= 0 ? '+' : '') + fmt(dRows) : '—').padStart(12)}  ` +
      `${fmt(Number(r.calls)).padStart(9)}  ` +
      `${(mostrarDelta && dCalls !== null ? (dCalls >= 0 ? '+' : '') + fmt(dCalls) : '—').padStart(7)}  ` +
      `${filasPorLlam.toFixed(1).padStart(10)}  ` +
      `${Number(r.mean_exec_time).toFixed(1).padStart(8)}`
    );
    console.log(`      ↳ ${truncar(r.query, 92)}`);
  });

  console.log(`\n  ${'─'.repeat(96)}`);
  console.log(`  Lectura rápida:`);
  console.log(`   • FILAS/LLAM alto  → cada llamada arrastra muchas filas (candidata a 'attributes' selectivos o paginación).`);
  console.log(`   • ΔLLAM alto       → se llama muy seguido (candidata a caché o a socket-patch incremental).`);
  console.log(`   • El fix de anoche apuntó al tablero de Producción (getODPs). Busca esa consulta y vigila su ΔLLAM/ΔFILAS.\n`);

  // 5) Guardar snapshot nuevo
  const nuevo: Snapshot = {
    tomado_en: new Date().toISOString(),
    stats_reset: statsReset,
    filas: {},
  };
  for (const r of rows) {
    nuevo.filas[r.queryid] = { calls: Number(r.calls), rows: Number(r.rows), query: r.query };
  }
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(nuevo, null, 2), 'utf-8');
  console.log(`  💾 Foto guardada en: ${SNAPSHOT_PATH}`);
  console.log(`     Corre este mismo script mañana para ver el delta del día.\n`);

  await sequelize.close();
};

run().catch((e) => {
  console.error('❌ Error ejecutando el diagnóstico:', e);
  process.exit(1);
});
