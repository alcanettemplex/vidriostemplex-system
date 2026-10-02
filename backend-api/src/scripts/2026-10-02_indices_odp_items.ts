/**
 * Script: 2026-10-02_indices_odp_items.ts
 *
 * Propósito: crear los dos índices que `odp_items` nunca tuvo (solo existía el de `id`).
 *
 *   1. odp_items(pedido_pv_id) — Pedidos PV consulta los ítems de cada pedido en tres
 *      lugares: el `EXISTS` que excluye "Por Gestionar", el m² de `M2_PEDIDO_SQL` (KPIs
 *      y desglose por proveedor) y el include `items_asignados`. Sin índice, cada
 *      pedido recorría la tabla completa: el KPI "m² Vendidos" costaba ~137 ms de
 *      ejecución en la BD con 402 pedidos y 1.222 ítems (medido 2026-10-02).
 *   2. odp_items(odp_id) — la relación ODP → ítems, que leen ODP, Compras, Producción
 *      y "Por Gestionar". Postgres no indexa las llaves foráneas por sí solo.
 *
 * Ejecutar: npx ts-node --files src/scripts/2026-10-02_indices_odp_items.ts
 * Idempotente: CREATE INDEX IF NOT EXISTS. Puede repetirse. NO corre con `npm run dev`.
 * Reversible: DROP INDEX idx_odp_items_pedido_pv_id; DROP INDEX idx_odp_items_odp_id;
 *
 * Sin CONCURRENTLY a propósito: la tabla tiene ~1.200 filas y el bloqueo de escritura
 * dura milisegundos; CONCURRENTLY además no puede ir dentro del pooler en modo transacción.
 */

import sequelize from '../config/database';

// Misma consulta que el KPI "m² Vendidos" de Gestión PV, sin filtros de pantalla.
const CONSULTA_KPI_M2 = `
  SELECT SUM(
    CASE WHEN EXISTS (SELECT 1 FROM odp_items oi WHERE oi.pedido_pv_id = p.id)
      THEN (SELECT COALESCE(SUM(COALESCE(oi.ancho_mm, 0) * COALESCE(oi.alto_mm, 0) / 1000000.0
                                * COALESCE(NULLIF(oi.cantidad, 0), 1)), 0)
              FROM odp_items oi WHERE oi.pedido_pv_id = p.id)
      ELSE COALESCE(p.metraje_venta, 0)
    END)
  FROM pedido_pv p
  WHERE p.origen = 'SISTEMA'
    AND (p.estado <> 'PENDIENTE' OR EXISTS (SELECT 1 FROM odp_items oi WHERE oi.pedido_pv_id = p.id))
`;

const medir = async (etiqueta: string) => {
  const [filas] = await sequelize.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${CONSULTA_KPI_M2}`);
  const plan = (filas as { 'QUERY PLAN': { 'Execution Time': number }[] }[])[0]['QUERY PLAN'][0];
  console.log(`  ${etiqueta}: KPI m² = ${plan['Execution Time'].toFixed(1)} ms de ejecución en BD`);
};

async function run() {
  console.log('=== Índices odp_items — 2026-10-02 ===\n');

  await medir('Antes  ');

  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_odp_items_pedido_pv_id ON odp_items (pedido_pv_id);`);
  console.log('  ✔ idx_odp_items_pedido_pv_id');

  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_odp_items_odp_id ON odp_items (odp_id);`);
  console.log('  ✔ idx_odp_items_odp_id');

  // Estadísticas frescas para que el planificador use los índices desde ya.
  await sequelize.query(`ANALYZE odp_items;`);

  await medir('Después');

  const [indices] = await sequelize.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'odp_items' ORDER BY indexname;`
  );
  console.log('\nVerificación:');
  console.table(indices);
}

run()
  .then(() => console.log('\nListo.'))
  .catch((e) => {
    console.error('Falló la migración:', e);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
